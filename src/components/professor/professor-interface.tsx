'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore, differenceInHours, isWithinInterval } from 'date-fns'; // Added isWithinInterval
import { it } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserData, AllUsersData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, ScheduleAssignment, BookingViewSlot } from '@/types/schedule'; // Import schedule types
import type { AllProfessorAvailability, ClassroomSchedule } from '@/types/app-data'; // Import app data types
import type { ScheduleConfiguration, AllScheduleConfigurations } from '@/types/schedule-configuration'; // Import configuration types
import { readData, writeData } from '@/services/data-storage'; // Import data storage service
import { logError } from '@/services/logging'; // Import the error logging service
import { findRelevantConfigurations } from '@/components/admin/admin-interface'; // Import the helper function


// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_CONFIGURATIONS_FILE = 'scheduleConfigurations'; // Use configurations file
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)
const GUEST_PROFESSOR_EMAIL = 'ospite@creativeacademy.it'; // Guest Professor constant

const daysOfWeek = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export function ProfessorInterface() {
  const [selectedAvailabilityDate, setSelectedAvailabilityDate] = useState<Date | undefined>(new Date());
  const [dailySlots, setDailySlots] = useState<BookableSlot[]>([]); // Slots this professor OFFERS for the selected date
  const [professorBookedSlots, setProfessorBookedSlots] = useState<BookableSlot[]>([]); // Slots THIS professor HAS BEEN BOOKED FOR
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null);
  const [allAvailableSlotsToBook, setAllAvailableSlotsToBook] = useState<BookingViewSlot[]>([]); // ALL slots available for THIS professor TO BOOK
  const [myBookedLessons, setMyBookedLessons] = useState<BookingViewSlot[]>([]); // Lessons THIS professor booked WITH OTHERS
  const [selectedBookingDate, setSelectedBookingDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [scheduleConfigurations, setScheduleConfigurations] = useState<ScheduleConfiguration[]>([]); // Store loaded configurations


  const {toast} = useToast();

   // Get current user email from localStorage on mount
   useEffect(() => {
      if (typeof window !== 'undefined') {
        const storedUserSession = localStorage.getItem(LOGGED_IN_USER_KEY);
        if (storedUserSession) {
          try {
            const userSessionData = JSON.parse(storedUserSession);
             if (userSessionData.role === 'professor' && userSessionData.username) {
                 setCurrentUserEmail(userSessionData.username);
             } else {
                 console.error("Utente loggato non valido o non professore:", userSessionData);
             }
          } catch (e) {
            console.error("Errore parsing dati sessione:", e);
            logError(e, 'Professor Mount (Parse Session)');
          }
        } else {
            console.log("Nessuna sessione utente trovata.");
        }
      }
   }, []); // Runs only once on mount


   // Function to sort slots consistently by date then time
   const sortSlotsByDateAndTime = <T extends { date: string; time: string }>(slots: T[]): T[] => {
       return slots.sort((a, b) => {
           if (!a?.date || !b?.date || !a?.time || !b?.time) return 0;
           const dateCompare = a.date.localeCompare(b.date);
           if (dateCompare !== 0) return dateCompare;
           return a.time.localeCompare(b.time);
       });
   };


  // Load ALL necessary data from files
   const loadAllData = useCallback(async () => {
       if (!currentUserEmail) return; // Don't load if user email is not set yet

       setIsLoading(true);
       try {
           // 1. Load assigned professors for the current user
           const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
           const currentUserData = allUsers[currentUserEmail];
           if (currentUserData) {
                setAssignedProfessorEmails(Array.isArray(currentUserData.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : null);
           } else {
               console.warn("Dati utente corrente non trovati:", currentUserEmail);
               setAssignedProfessorEmails(null);
           }

           // 2. Load ALL saved schedule configurations
           const loadedConfigurations = await readData<AllScheduleConfigurations>(SCHEDULE_CONFIGURATIONS_FILE, []);
           setScheduleConfigurations(loadedConfigurations); // Store configurations in state

           // 3. Load all professor availability data (for booked slots and slots to book)
           const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});

           // --- Process data for "Manage Availability" Tab ---
           const professorOfferedSlots = allProfessorAvailability[currentUserEmail] || [];
           const bookedForCurrentUser = professorOfferedSlots.filter(slot => slot?.bookedBy && slot.duration === 60);
           setProfessorBookedSlots(sortSlotsByDateAndTime([...bookedForCurrentUser]));

           // Process slots for the *selected availability date* using RELEVANT configurations
           if (selectedAvailabilityDate) {
               const relevantConfigs = findRelevantConfigurations(selectedAvailabilityDate, loadedConfigurations); // Find relevant configs for the date
                if (relevantConfigs.length > 0) {
                    const formattedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');
                    const dayIndex = getDay(selectedAvailabilityDate);
                    const dayOfWeekString = daysOfWeek[dayIndex]; // Get day name in Italian from date-fns getDay index
                    const isPastDate = isBefore(selectedAvailabilityDate, startOfDay(new Date()));

                    // Create a map of existing slots for the current professor on the selected date for quick lookup
                    const professorExistingSlotsMap = new Map<string, BookableSlot>(
                         (allProfessorAvailability[currentUserEmail] || [])
                           .filter(slot => slot?.date === formattedDate && slot.duration === 60 && slot.professorEmail === currentUserEmail)
                           .map(slot => [slot.id, slot]) // Use unique ID as key
                     );


                    const generatedSlots: BookableSlot[] = [];
                    const potentialAssignments = new Set<string>(); // Use a Set to store unique 'time-classroom' combinations

                     // Iterate through all relevant configurations
                    relevantConfigs.forEach(config => {
                        Object.entries(config.schedule).forEach(([scheduleKey, assignment]) => {
                            const parts = scheduleKey.split('-');
                            if (parts.length < 3) return;
                            const day = parts[0]; // Day name from the key (e.g., "Lunedì")
                            const hourTime = parts[1];
                            const classroom = parts.slice(2).join('-');

                            // Check if the assignment is for the current professor on the selected day of the week
                             if (day === dayOfWeekString && assignment.professor === currentUserEmail && hourTime?.endsWith(':00')) {
                                potentialAssignments.add(`${hourTime}-${classroom}`); // Add unique time-classroom
                            }
                        });
                    });

                    // Generate slots based on the combined potential assignments
                     potentialAssignments.forEach(timeClassroomKey => {
                        const [hourTime, classroom] = timeClassroomKey.split('-');
                        const slotId = `${formattedDate}-${hourTime}-${classroom}-${currentUserEmail}`; // Construct unique ID
                        const existingSlotData = professorExistingSlotsMap.get(slotId);

                         // Determine initial availability based on existing data or default to false if new
                        const initialIsAvailable = existingSlotData?.isAvailable ?? false;

                         // Special case: If the professor is the GUEST professor, their slots derived from config are always initially "available"
                         // unless explicitly booked in availability.json. We reflect this here for the UI.
                         const isAvailableForUI = currentUserEmail === GUEST_PROFESSOR_EMAIL
                           ? !existingSlotData?.bookedBy // Guest slot is available if not booked
                           : initialIsAvailable; // Regular professor uses stored availability

                         // Include the slot only if it's not in the past OR if it's in the past but booked (to allow cancellation)
                         if (!isPastDate || (isPastDate && existingSlotData?.bookedBy)) {
                            generatedSlots.push({
                                id: slotId,
                                date: formattedDate,
                                day: dayOfWeekString, // Use the calculated day name
                                time: hourTime,
                                classroom: classroom,
                                duration: 60,
                                isAvailable: isAvailableForUI, // Use UI-specific availability
                                bookedBy: existingSlotData?.bookedBy ?? null,
                                bookingTime: existingSlotData?.bookingTime ?? null,
                                professorEmail: currentUserEmail,
                            });
                         }
                     });

                    setDailySlots(sortSlotsByDateAndTime(generatedSlots));
                } else {
                    console.log(`[Professor] No relevant schedule configurations found for ${format(selectedAvailabilityDate, 'yyyy-MM-dd')}`);
                    setDailySlots([]); // No relevant configurations, no slots to manage
                }
           } else {
               setDailySlots([]); // Clear if no date selected
           }

           // --- Process data for "Book Lessons" Tab ---
            const loadedAllAvailableToBook: BookingViewSlot[] = [];
            const loadedMyBookings: BookingViewSlot[] = [];
            const processedBookedIds = new Set<string>();
            const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];

            Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
                // Check slots booked BY the current user first
                (slots || []).forEach(slot => {
                    if (slot?.id && slot.classroom && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                        const bookingViewSlot: BookingViewSlot = {
                            id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                            professorEmail: slot.professorEmail,
                            isBookedByCurrentUser: true,
                            bookingTime: slot.bookingTime || null,
                        };
                        loadedMyBookings.push(bookingViewSlot);
                        processedBookedIds.add(slot.id);
                    }
                });

                // Check slots from ASSIGNED professors (excluding self) for booking availability
                if (currentlyAssigned.includes(profEmail) && profEmail !== currentUserEmail) {
                    (slots || []).forEach(slot => {
                         if (slot?.id && slot.classroom && slot.professorEmail === profEmail && slot.duration === 60) {
                             try {
                                 const slotDateObj = parseISO(slot.date);
                                 const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                                 const relevantBookingConfigs = findRelevantConfigurations(slotDateObj, loadedConfigurations);
                                 const dayOfWeekBooking = format(slotDateObj, 'EEEE', { locale: it });

                                 const isActiveInAnyConfig = relevantBookingConfigs.some(config =>
                                     Object.entries(config.schedule).some(([key, assignment]) => {
                                         const [day, time, classroom] = key.split('-');
                                         return day === dayOfWeekBooking && time === slot.time && classroom === slot.classroom && assignment.professor === slot.professorEmail;
                                     })
                                 );

                                  // Determine actual availability for booking view
                                  const isActuallyAvailable =
                                      profEmail === GUEST_PROFESSOR_EMAIL
                                          ? !slot.bookedBy && isActiveInAnyConfig // Guest available if not booked & in active config
                                          : slot.isAvailable && !slot.bookedBy && isActiveInAnyConfig; // Regular needs flag, no booking & in active config


                                 if (isActuallyAvailable && !isBefore(slotDateTime, startOfDay(new Date()))) {
                                      const bookingViewSlot: BookingViewSlot = {
                                          id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                                          professorEmail: slot.professorEmail,
                                          isBookedByCurrentUser: false, // It's available
                                          bookingTime: null,
                                      };
                                      if (!loadedAllAvailableToBook.some(s => s.id === bookingViewSlot.id)) {
                                          loadedAllAvailableToBook.push(bookingViewSlot);
                                      }
                                 }
                             } catch (parseError) { console.warn(`Parse error slot ${slot.id}:`, parseError); }
                         }
                    });
                }

                 // Special handling if GUEST professor is assigned but has NO entries in availability.json yet
                 if (currentlyAssigned.includes(GUEST_PROFESSOR_EMAIL) && !allProfessorAvailability[GUEST_PROFESSOR_EMAIL]) {
                     console.log("[Professor] Guest professor assigned, checking schedule configs for available guest slots...");
                     if (selectedBookingDate) { // Check based on the booking calendar date
                         const relevantConfigs = findRelevantConfigurations(selectedBookingDate, loadedConfigurations);
                         const dayOfWeek = format(selectedBookingDate, 'EEEE', { locale: it });
                         const formattedDate = format(selectedBookingDate, 'yyyy-MM-dd');

                         relevantConfigs.forEach(config => {
                             Object.entries(config.schedule).forEach(([key, assignment]) => {
                                 const [confDay, confTime, confClassroom] = key.split('-');
                                 if (confDay === dayOfWeek && assignment.professor === GUEST_PROFESSOR_EMAIL) {
                                     const slotId = `${formattedDate}-${confTime}-${confClassroom}-${GUEST_PROFESSOR_EMAIL}`;
                                     const slotDateTime = parseISO(`${formattedDate}T${confTime}:00`);
                                     if (!loadedAllAvailableToBook.some(s => s.id === slotId) && !isBefore(slotDateTime, startOfDay(new Date()))) {
                                          const guestBookingViewSlot: BookingViewSlot = {
                                              id: slotId, date: formattedDate, day: dayOfWeek, time: confTime, classroom: confClassroom, duration: 60,
                                              professorEmail: GUEST_PROFESSOR_EMAIL,
                                              isBookedByCurrentUser: false,
                                              bookingTime: null,
                                          };
                                         loadedAllAvailableToBook.push(guestBookingViewSlot);
                                     }
                                 }
                             });
                         });
                     }
                 }

            });

            setAllAvailableSlotsToBook(sortSlotsByDateAndTime(loadedAllAvailableToBook));
            setMyBookedLessons(sortSlotsByDateAndTime(loadedMyBookings));

       } catch (error) {
           console.error("Failed to load data for professor:", error);
           await logError(error, 'Professor Load Data'); // Log error
           toast({ variant: "destructive", title: "Errore Caricamento Dati", description: "Impossibile caricare i dati necessari." });
           setDailySlots([]);
           setProfessorBookedSlots([]);
           setAssignedProfessorEmails(null);
           setAllAvailableSlotsToBook([]);
           setMyBookedLessons([]);
           setScheduleConfigurations([]); // Reset configurations on error
       } finally {
           setIsLoading(false);
       }
   }, [currentUserEmail, selectedAvailabilityDate, selectedBookingDate, toast]); // Include dependencies


  // Trigger data loading when currentUserEmail is set or selected dates change
  useEffect(() => {
      if(currentUserEmail) {
          loadAllData();
      }
  }, [currentUserEmail, selectedAvailabilityDate, selectedBookingDate, loadAllData]); // Add selectedBookingDate


   // Save function for professor's OWN availability
   const saveOwnAvailability = useCallback(async (updatedSlotsForDay: BookableSlot[]) => {
        if (currentUserEmail && selectedAvailabilityDate) {
             setIsLoading(true); // Indicate saving
             try {
                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                let currentProfessorSlots = allAvailability[currentUserEmail] || [];
                const formattedSelectedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');

                 // Ensure only valid slots are processed
                 const validUpdatedSlotsForDay = updatedSlotsForDay.filter(slot =>
                     slot && slot.id && slot.date && slot.time && slot.classroom && typeof slot.duration === 'number' && slot.professorEmail === currentUserEmail
                 );

                 // Filter out old slots for the selected date and merge with the new/updated ones for that day
                 const slotsToKeep = currentProfessorSlots.filter(slot => slot?.date !== formattedSelectedDate);
                 const newProfessorSlots = [...slotsToKeep, ...validUpdatedSlotsForDay];

                 // Sort before saving
                 allAvailability[currentUserEmail] = sortSlotsByDateAndTime(newProfessorSlots);
                 await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);
                 console.log(`[Professor] Saved availability for ${currentUserEmail} on ${formattedSelectedDate}`);
                 // No toast here, handled in the calling function (toggleSlotAvailability)
             } catch(error: any) {
                  console.error("Failed to save own availability:", error);
                  await logError(error, 'Professor Save Own Availability'); // Log error
                  toast({ variant: "destructive", title: "Errore Salvataggio", description: "Impossibile salvare la disponibilità." });
             } finally {
                  setIsLoading(false);
             }
        }
   }, [currentUserEmail, selectedAvailabilityDate, toast]);


  const toggleSlotAvailability = async (id: string) => {
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedAvailabilityDate) { console.error("Slot non trovato o data non selezionata:", id); return; }

    if (isBefore(selectedAvailabilityDate, startOfDay(new Date())) && !slotToToggle.bookedBy) {
         toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità per slot passati non prenotati." });
         return;
    }

     if (slotToToggle.bookedBy) {
        toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità di uno slot già prenotato." });
        return;
     }

    // Guest slots availability is derived, not toggled directly. Prevent toggle for GUEST.
    if (currentUserEmail === GUEST_PROFESSOR_EMAIL) {
        toast({ variant: "destructive", title: "Azione Negata", description: "La disponibilità degli slot Ospite è gestita automaticamente." });
        return;
    }

    const updatedSlot = { ...slotToToggle, isAvailable: !slotToToggle.isAvailable };
    const updatedDailySlots = dailySlots.map((slot) => slot.id === id ? updatedSlot : slot);
    setDailySlots(updatedDailySlots); // Update UI immediately

    await saveOwnAvailability(updatedDailySlots); // Pass all slots for the current day

    toast({ title: updatedSlot.isAvailable ? "Slot Reso Disponibile" : "Slot Reso Non Disponibile", description: `Slot alle ${slotToToggle.time} in ${slotToToggle.classroom} del ${format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it })} è ora ${updatedSlot.isAvailable ? 'disponibile' : 'non disponibile'}.` });
  };

   // Function to cancel a booking MADE BY OTHERS for THIS professor's slots
   const cancelOwnBooking = useCallback(async (slotId: string) => {
       if (currentUserEmail) {
           setIsLoading(true);
           try {
               const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
               let professorSlots = allAvailability[currentUserEmail];
               if (!professorSlots) throw new Error("Slot professore non trovati.");

               const slotIndex = professorSlots.findIndex(s => s?.id === slotId); // Find by ID
               if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

               const slotToCancel = professorSlots[slotIndex];
                let lessonDateTime; try { lessonDateTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                if (isBefore(lessonDateTime, new Date())) {
                     throw new Error("Impossibile cancellare una lezione passata.");
                }
               const bookerEmail = slotToCancel.bookedBy;
               if (!bookerEmail) throw new Error("Slot non prenotato.");

               const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToCancel.time;
               const classroomInfo = slotToCancel.classroom;
               const eventTitle = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
               const { deleteLink } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitle, eventTitle, classroomInfo);

               // Update slot data
               slotToCancel.bookedBy = null;
               slotToCancel.bookingTime = null;
               // Set isAvailable based on professor type
               // Regular professors become available again.
               // Guest slots' availability is derived, so we don't set isAvailable=true here.
               slotToCancel.isAvailable = currentUserEmail !== GUEST_PROFESSOR_EMAIL;


               // Save updated availability
               allAvailability[currentUserEmail][slotIndex] = slotToCancel;
               await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

               // Send cancellation emails
               try {
                  await sendEmail({ to: bookerEmail, subject: 'Lezione Cancellata dal Professore', html: `<p>Ciao,</p><p>La tua lezione in ${classroomInfo} con il Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata dal professore.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLink}">Rimuovi dal Calendario</a></p>` });
                  // Don't send confirmation to GUEST professor
                  if (currentUserEmail !== GUEST_PROFESSOR_EMAIL) {
                     await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione Effettuata', html: `<p>Ciao Prof. ${currentUserEmail},</p><p>Hai cancellato la prenotazione di ${bookerEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}. Lo slot è di nuovo disponibile.</p>` });
                  }
               } catch (emailError) {
                    console.error("Errore invio email cancellazione (prof):", emailError);
                    await logError(emailError, 'Professor Cancel Own Booking (Email)');
                    toast({ title: "Avviso", description: `Prenotazione cancellata, ma errore nell'invio email.` });
                }

               toast({ title: "Prenotazione Cancellata", description: `Prenotazione da ${bookerEmail} cancellata. Lo slot è di nuovo disponibile.` });
               await loadAllData(); // Refresh all data

           } catch (error: any) {
                console.error("Errore cancellazione prenotazione propria:", error);
                await logError(error, 'Professor Cancel Own Booking (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Cancellazione", description: error.message || "Impossibile cancellare la prenotazione." });
           } finally {
               setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadAllData, toast]); // Dependencies


  // --- Functions for Booking Lessons with OTHER Professors ---

   const bookLessonWithProfessor = useCallback(async (slotToBook: BookingViewSlot) => {
       if (currentUserEmail) {
           setIsLoading(true);
           try {
                const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
                const currentUserData = allUsers[currentUserEmail];
                const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];
                if (!currentlyAssigned.includes(slotToBook.professorEmail)) {
                     throw new Error("Puoi prenotare solo slot di professori a te assegnati.");
                }

                 // Check if the slot is still valid according to active schedule config
                const slotDateObj = parseISO(slotToBook.date);
                const relevantBookingConfigs = findRelevantConfigurations(slotDateObj, scheduleConfigurations);
                const dayOfWeekBooking = format(slotDateObj, 'EEEE', { locale: it });

                const isActiveInAnyConfig = relevantBookingConfigs.some(config =>
                     Object.entries(config.schedule).some(([key, assignment]) => {
                         const [day, time, classroom] = key.split('-');
                         return day === dayOfWeekBooking && time === slotToBook.time && classroom === slotToBook.classroom && assignment.professor === slotToBook.professorEmail;
                     })
                );

                if (!isActiveInAnyConfig) {
                    throw new Error("Questo slot non è più valido secondo l'orario attuale.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                // Ensure target professor array exists, especially for GUEST
                if (!allAvailability[slotToBook.professorEmail]) {
                    allAvailability[slotToBook.professorEmail] = [];
                }
                const targetProfessorSlots = allAvailability[slotToBook.professorEmail];

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToBook.id); // Find by ID

                let originalSlot: BookableSlot;
                if (slotIndex !== -1) {
                   // Slot exists in availability file
                   originalSlot = targetProfessorSlots[slotIndex];
                   let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }

                   // Check availability again (race condition)
                   const isStillAvailable = slotToBook.professorEmail === GUEST_PROFESSOR_EMAIL
                       ? !originalSlot.bookedBy // Guest available if not booked
                       : originalSlot.isAvailable && !originalSlot.bookedBy; // Regular needs flag and no booking

                   if (!isStillAvailable || isBefore(slotDateTime, new Date())) {
                       throw new Error("Lo slot non è più disponibile o è nel passato.");
                   }
                } else if (slotToBook.professorEmail === GUEST_PROFESSOR_EMAIL) {
                    // Slot is for GUEST and doesn't exist in availability.json yet, create it
                    console.log(`[Professor Booking] Creating new availability entry for guest slot ${slotToBook.id}`);
                    originalSlot = {
                        ...slotToBook,
                        isAvailable: false, // Will be immediately booked
                        bookedBy: null, // Will be set below
                        bookingTime: null,
                    };
                } else {
                    throw new Error("Slot da prenotare non trovato nella disponibilità del professore.");
                }


                // --- Update Slot ---
                originalSlot.bookedBy = currentUserEmail;
                originalSlot.bookingTime = new Date().toISOString();
                originalSlot.isAvailable = false; // Always false after booking

                // --- Save Update ---
                if (slotIndex !== -1) {
                    targetProfessorSlots[slotIndex] = originalSlot; // Update existing
                } else {
                    targetProfessorSlots.push(originalSlot); // Add newly created guest slot
                }
                // Sort before saving
                allAvailability[slotToBook.professorEmail] = sortSlotsByDateAndTime(targetProfessorSlots);
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);


               // --- Prepare and Send Emails ---
               const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToBook.time;
               const classroomInfo = slotToBook.classroom;
               const eventTitleBooker = `Lezione in ${classroomInfo} con Prof. ${slotToBook.professorEmail}`;
               const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
               const descriptionBooker = `Lezione prenotata con ${slotToBook.professorEmail} in ${classroomInfo}.`;
               const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
               const { addLink: addLinkBooker } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleBooker, eventTitleBooker, classroomInfo, descriptionBooker);
               const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

                try {
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione con Collega', html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkBooker}">Aggiungi al Calendario</a></p>` });
                  // Don't send email to GUEST professor
                  if (slotToBook.professorEmail !== GUEST_PROFESSOR_EMAIL) {
                     await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta da Collega', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dal Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
                  }
                } catch (emailError) {
                    console.error("Errore invio email conferma (prof-prof):", emailError);
                    await logError(emailError, 'Professor Book Lesson (Email)');
                    toast({ title: "Avviso", description: `Prenotazione effettuata, ma errore nell'invio email.` });
                }

               toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata.` });
               await loadAllData(); // Refresh all data

           } catch (error: any) {
                console.error("Errore prenotazione lezione con professore:", error);
                await logError(error, 'Professor Book Lesson (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Prenotazione", description: error.message || "Impossibile prenotare la lezione." });
                await loadAllData(); // Refresh even on error to ensure UI consistency
           } finally {
                setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadAllData, toast, scheduleConfigurations]); // Dependencies updated


   const cancelLessonWithProfessor = useCallback(async (slotToCancel: BookingViewSlot) => {
       if (currentUserEmail) {
            setIsLoading(true);
            try {
                let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                if (differenceInHours(lessonStartTime, new Date()) < 24) {
                    throw new Error("Impossibile cancellare meno di 24 ore prima.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                const targetProfessorSlots = allAvailability[slotToCancel.professorEmail];
                if (!targetProfessorSlots) throw new Error("Slot professore target non trovati.");

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToCancel.id); // Find by ID
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

                const originalSlot = targetProfessorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                // Update slot
                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                // Set isAvailable based on professor type
                originalSlot.isAvailable = slotToCancel.professorEmail !== GUEST_PROFESSOR_EMAIL;


                // Save update for TARGET professor
                allAvailability[slotToCancel.professorEmail][slotIndex] = originalSlot;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

                // Prepare email details
                const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
                const formattedTime = slotToCancel.time;
                const classroomInfo = slotToCancel.classroom;
                const eventTitleBooker = `Lezione in ${classroomInfo} con Prof. ${slotToCancel.professorEmail}`;
                const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
                const { deleteLink: deleteLinkBooker } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleBooker, eventTitleBooker, classroomInfo);
                const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

                // Send cancellation emails
                try {
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione con Collega', html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkBooker}">Rimuovi dal Calendario</a></p>` });
                  // Don't send email to GUEST professor
                  if (slotToCancel.professorEmail !== GUEST_PROFESSOR_EMAIL) {
                     await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata da Collega', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione del Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                  }
                } catch (emailError) {
                    console.error("Errore invio email cancellazione (prof-prof):", emailError);
                    await logError(emailError, 'Professor Cancel Lesson (Email)');
                    toast({ title: "Avviso", description: `Cancellazione effettuata, ma errore nell'invio email.` });
                }

                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} è stata cancellata.` });
                await loadAllData(); // Refresh all data

            } catch (error: any) {
                console.error("Errore cancellazione lezione con professore:", error);
                await logError(error, 'Professor Cancel Lesson (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Cancellazione", description: error.message || "Impossibile cancellare la prenotazione." });
           } finally {
               setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadAllData, toast]); // Dependencies


   // Filter available slots based on the selected booking date
    const filteredAvailableSlotsToBook = selectedBookingDate
      ? allAvailableSlotsToBook.filter(slot => slot.date === format(selectedBookingDate, 'yyyy-MM-dd'))
      : [];

   // Display loading indicator
   if (isLoading && !currentUserEmail) { // Show loading only if user is not yet identified or data is loading
       return <div className="flex justify-center items-center h-screen"><p>Caricamento...</p></div>;
   }


  return (
    <div className="flex flex-col gap-6 p-4 w-full">
       <Tabs defaultValue="manage-availability" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2">
                <TabsTrigger value="manage-availability" disabled={isLoading}>Gestisci Disponibilità</TabsTrigger>
                <TabsTrigger value="book-lessons" disabled={isLoading}>Prenota Lezioni con Altri Professori</TabsTrigger>
            </TabsList>

            {/* Tab 1: Manage Own Availability */}
            <TabsContent value="manage-availability">
                 <Card className="w-full">
                    <CardHeader>
                        <CardTitle>Gestisci la Tua Disponibilità</CardTitle>
                        <CardDescription>Seleziona una data per gestire i tuoi slot prenotabili da 60 minuti.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="flex justify-center">
                            <Calendar
                                locale={it} mode="single" selected={selectedAvailabilityDate} onSelect={setSelectedAvailabilityDate}
                                className="rounded-md border"
                                // Disable past dates unless there's a booking for that date (allows viewing/cancelling past bookings)
                                disabled={(date) => (isBefore(date, startOfDay(new Date())) && !professorBookedSlots.some(slot => slot.date === format(date, 'yyyy-MM-dd'))) || isLoading}
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">
                              Gestisci Slot per {selectedAvailabilityDate ? format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it }) : 'Nessuna data selezionata'}
                            </h3>
                            {isLoading ? <p>Caricamento slot...</p> : dailySlots.length === 0 ? (
                                <p className="text-muted-foreground p-4 text-center">
                                   {selectedAvailabilityDate ? (isBefore(selectedAvailabilityDate, startOfDay(new Date())) ? "Non puoi gestire slot passati." : `Nessuno slot assegnato per te il ${daysOfWeek[getDay(selectedAvailabilityDate)]} da una configurazione valida.`) : 'Seleziona una data.'}
                                </p>
                            ) : (
                                <div className="overflow-x-auto border rounded-md max-h-96">
                                  <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-24">Ora</TableHead>
                                            <TableHead>Aula</TableHead>
                                            <TableHead className="w-20 text-center">Durata</TableHead>
                                            <TableHead>Stato</TableHead>
                                            <TableHead className="w-40 text-center">Azioni</TableHead>
                                            <TableHead>Info Prenotazione</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {dailySlots.map((slot) => {
                                        if (!slot) return null;
                                        const isBooked = !!slot.bookedBy;
                                        let isPastSlot = false;
                                        try {
                                            const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                                            isPastSlot = isBefore(slotDateTime, new Date());
                                        } catch { console.warn(`Invalid date/time for slot ${slot.id}`); }

                                        const statusText = isBooked ? 'Prenotato' : (slot.isAvailable ? 'Disponibile' : 'Non Disponibile');
                                        const statusColor = isBooked ? 'text-gray-500' : (slot.isAvailable ? 'text-green-600' : 'text-red-600');
                                        const isPastAndNotBooked = isPastSlot && !isBooked;

                                        return (
                                          <TableRow key={slot.id}>
                                            <TableCell>{slot.time}</TableCell>
                                            <TableCell>{slot.classroom}</TableCell>
                                            <TableCell className="text-center">{slot.duration} min</TableCell>
                                            <TableCell className={cn(statusColor, "font-medium")}>{statusText}</TableCell>
                                            <TableCell className="text-center">
                                                 {isBooked ? (
                                                    // Show 'Prenotato' text, non-clickable in calendar view
                                                    <span className="text-muted-foreground font-normal px-1 italic">Prenotato</span>
                                                  ) : isPastAndNotBooked ? (
                                                      <span className="text-muted-foreground font-normal px-1 italic">Passato</span>
                                                 ) : (
                                                     // Show the availability toggle button
                                                     <Button
                                                         onClick={() => toggleSlotAvailability(slot.id)}
                                                         variant={slot.isAvailable ? 'destructive' : 'default'}
                                                         size="sm"
                                                         disabled={isLoading || currentUserEmail === GUEST_PROFESSOR_EMAIL} // Disable while loading/saving or if guest
                                                         title={currentUserEmail === GUEST_PROFESSOR_EMAIL ? "Disponibilità gestita automaticamente per Ospite" : ""}
                                                         className={cn(
                                                             'text-white',
                                                             slot.isAvailable ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700',
                                                             currentUserEmail === GUEST_PROFESSOR_EMAIL && 'opacity-50 cursor-not-allowed'
                                                         )}
                                                     >
                                                         {slot.isAvailable ? 'Rendi Non Disp.' : 'Rendi Disp.'}
                                                     </Button>
                                                 )}
                                             </TableCell>
                                            <TableCell>
                                              {slot.bookedBy ? `Da ${slot.bookedBy}${slot.bookingTime ? ` (${format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it })})` : ''}` : '—'}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                            )}
                        </div>
                    </CardContent>
                 </Card>
                  <Card className="w-full mt-6">
                       <CardHeader>
                           <CardTitle>Tutte le Lezioni Prenotate con Te</CardTitle>
                           <CardDescription>Elenco di tutte le lezioni attualmente prenotate con te. Puoi cancellarle da qui (se non passate).</CardDescription>
                       </CardHeader>
                       <CardContent>
                           {isLoading ? <p>Caricamento prenotazioni...</p> : professorBookedSlots.length === 0 ? (
                               <p className="text-muted-foreground p-4 text-center">Nessuna lezione è attualmente prenotata con te.</p>
                           ) : (
                               <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                       <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Prenotato Da</TableHead><TableHead>Ora Prenotazione</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                       <TableBody>
                                           {professorBookedSlots.map((slot) => {
                                               if (!slot?.id) return null;
                                                let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`booked-prof-${slot.id}`}><TableCell colSpan={7}>Dati slot non validi</TableCell></TableRow>; }
                                                const isPastLesson = isBefore(lessonDateTime, new Date());
                                               return (
                                                   <TableRow key={`booked-prof-${slot.id}`}>
                                                       <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                       <TableCell>{slot.time}</TableCell>
                                                       <TableCell>{slot.classroom}</TableCell>
                                                       <TableCell className="text-center">{slot.duration} min</TableCell>
                                                       <TableCell>{slot.bookedBy}</TableCell>
                                                       <TableCell>{slot.bookingTime ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}</TableCell>
                                                       <TableCell className="text-center">
                                                        {isPastLesson ? (
                                                             <span className="text-muted-foreground italic">Lezione passata</span>
                                                        ) : (
                                                           <Button onClick={() => cancelOwnBooking(slot.id)} variant="destructive" size="sm" disabled={isLoading}>Cancella Prenotazione</Button>
                                                        )}
                                                       </TableCell>
                                                   </TableRow>
                                               );
                                           })}
                                       </TableBody>
                                   </Table>
                               </div>
                           )}
                       </CardContent>
                  </Card>
            </TabsContent>

            {/* Tab 2: Book Lessons with Other Professors */}
            <TabsContent value="book-lessons">
                 <Card className="w-full">
                     <CardHeader>
                         <CardTitle>Prenota Lezioni con Altri Professori</CardTitle>
                         {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                             <CardDescription>Seleziona una data per prenotare slot con i professori assegnati ({assignedProfessorEmails.join(', ')}).</CardDescription>
                         ) : (
                             <CardDescription>Nessun professore assegnato per prenotare lezioni.</CardDescription>
                         )}
                     </CardHeader>
                     <CardContent className="grid gap-6 md:grid-cols-2">
                          <div className="flex justify-center">
                              <Calendar
                                  locale={it}
                                  mode="single"
                                  selected={selectedBookingDate}
                                  onSelect={setSelectedBookingDate}
                                  className="rounded-md border"
                                  disabled={(date) => isBefore(date, startOfDay(new Date())) || isLoading}
                              />
                          </div>
                         <div>
                             <h3 className="text-lg font-semibold mb-3">Slot Disponibili per {selectedBookingDate ? format(selectedBookingDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data'}</h3>
                             {isLoading ? <p>Caricamento slot...</p> : !assignedProfessorEmails || assignedProfessorEmails.length === 0 ? (
                                 <p className="text-muted-foreground p-4 text-center">Nessun professore assegnato.</p>
                             ) : !selectedBookingDate ? (
                                     <p className="text-muted-foreground p-4 text-center">Seleziona una data.</p>
                             ) : filteredAvailableSlotsToBook.length === 0 ? (
                                         <p className="text-muted-foreground p-4 text-center">Nessuno slot disponibile per la prenotazione.</p>
                                     ) : (
                                         <div className="overflow-x-auto border rounded-md max-h-96">
                                             <Table>
                                                 <TableHeader><TableRow><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-28 text-center">Azioni</TableHead></TableRow></TableHeader>
                                                 <TableBody>
                                                     {filteredAvailableSlotsToBook.map((slot) => (
                                                         <TableRow key={`available-to-book-${slot.id}`}>
                                                             <TableCell>{slot.time}</TableCell>
                                                             <TableCell>{slot.classroom}</TableCell>
                                                             <TableCell>{slot.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : slot.professorEmail}</TableCell>
                                                             <TableCell className="text-center">{slot.duration} min</TableCell>
                                                             <TableCell className="text-center">
                                                                 <Button onClick={() => bookLessonWithProfessor(slot)} size="sm" disabled={isLoading}>Prenota</Button>
                                                             </TableCell>
                                                         </TableRow>
                                                     ))}
                                                 </TableBody>
                                             </Table>
                                         </div>
                                     )}
                         </div>

                         {/* Lessons THIS Professor Booked WITH OTHERS */}
                         <div className="md:col-span-2">
                            <h3 className="text-lg font-semibold mb-3 mt-6">Le Tue Lezioni Prenotate (con altri)</h3>
                            {isLoading ? <p>Caricamento prenotazioni...</p> : myBookedLessons.length === 0 ? (
                                 <p className="text-muted-foreground p-4 text-center">Non hai prenotato nessuna lezione con altri professori.</p>
                            ) : (
                                 <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                     <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                       {myBookedLessons.map((slot) => {
                                         if (!slot?.id) return null;
                                         let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`my-booked-${slot.id}`}><TableCell colSpan={6}>Dati slot non validi</TableCell></TableRow>; }
                                         const isPastLesson = isBefore(lessonDateTime, new Date());
                                         const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                                         return (
                                           <TableRow key={`my-booked-${slot.id}`}>
                                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell>{slot.time}</TableCell>
                                             <TableCell>{slot.classroom}</TableCell>
                                             <TableCell>{slot.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : slot.professorEmail}</TableCell>
                                             <TableCell className="text-center">{slot.duration} min</TableCell>
                                             <TableCell className="text-center">
                                              {isPastLesson ? (
                                                  <span className="text-muted-foreground italic">Lezione passata</span>
                                              ) : (
                                               <Button onClick={() => cancelLessonWithProfessor(slot)} variant="destructive" size="sm" disabled={!canCancel || isLoading} title={!canCancel ? "Impossibile cancellare meno di 24 ore prima" : "Cancella questa prenotazione"}>Cancella Prenotazione</Button>
                                              )}
                                             </TableCell>
                                           </TableRow>
                                       );
                                       })}
                                     </TableBody>
                                   </Table>
                                 </div>
                            )}
                         </div>
                     </CardContent>
                 </Card>
            </TabsContent>
       </Tabs>
    </div>
  );
}