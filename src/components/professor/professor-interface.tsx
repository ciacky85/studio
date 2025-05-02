
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore, differenceInHours, isWithinInterval, isValid } from 'date-fns'; // Added isValid
import { it } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserData, AllUsersData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, BookingViewSlot } from '@/types/schedule'; // Import schedule types
import type { AllProfessorAvailability } from '@/types/app-data'; // Import app data types
import type { ScheduleConfiguration, AllScheduleConfigurations } from '@/types/schedule-configuration'; // Import configuration types
import { readData, writeData } from '@/services/data-storage'; // Import data storage service
import { logError } from '@/services/logging'; // Import the error logging service
import { findRelevantConfigurations } from '@/components/admin/admin-interface'; // Import the helper function


// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_CONFIGURATIONS_FILE = 'scheduleConfigurations'; // Use configurations file
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)
const GUEST_IDENTIFIER = 'GUEST'; // Guest identifier constant

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

   // Load assigned professors and configurations separately
   useEffect(() => {
       const loadInitialData = async () => {
           if (!currentUserEmail) return;

           setIsLoading(true); // Indicate initial data load
           let loadedAssignments: string[] | null = null;
           let loadedConfigs: ScheduleConfiguration[] = [];
           try {
               // Load assigned professors
               const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
               const currentUserData = allUsers[currentUserEmail];
               loadedAssignments = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : null;

               // Load schedule configurations
               loadedConfigs = await readData<AllScheduleConfigurations>(SCHEDULE_CONFIGURATIONS_FILE, []);

               setAssignedProfessorEmails(loadedAssignments);
               setScheduleConfigurations(loadedConfigs);
           } catch (error: any) {
               console.error("Failed to load initial professor data:", error);
               await logError(error, 'Professor Load Initial Data');
               toast({ variant: "destructive", title: "Errore Caricamento Dati", description: `Impossibile caricare dati iniziali. Errore: ${error.message || 'Errore sconosciuto'}` });
               setAssignedProfessorEmails(null);
               setScheduleConfigurations([]);
           }
           // Do not set isLoading to false here; let loadAllData handle it
       };

       loadInitialData();
   }, [currentUserEmail, toast]);


   // Function to sort slots consistently by date then time
   const sortSlotsByDateAndTime = <T extends { date: string; time: string }>(slots: T[]): T[] => {
       return slots.sort((a, b) => {
           if (!a?.date || !b?.date || !a?.time || !b?.time) return 0;
           const dateCompare = a.date.localeCompare(b.date);
           if (dateCompare !== 0) return dateCompare;
           return a.time.localeCompare(b.time);
       });
   };


  // Load availability data and process slots when dependencies are ready
   const loadAllData = useCallback(async () => {
       if (!currentUserEmail || assignedProfessorEmails === null || scheduleConfigurations.length === 0) {
           setIsLoading(true); // Keep loading if essential data isn't ready
           setDailySlots([]);
           setProfessorBookedSlots([]);
           setAllAvailableSlotsToBook([]);
           setMyBookedLessons([]);
           return; // Don't proceed if prerequisites aren't met
       }

       setIsLoading(true);
       try {
           // Load all professor availability data (for booked slots and slots to book)
           const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});

           // --- Process data for "Manage Availability" Tab ---
           const professorOfferedSlots = allProfessorAvailability[currentUserEmail] || [];
           const bookedForCurrentUser = professorOfferedSlots.filter(slot => slot?.bookedBy && slot.duration === 60);
           setProfessorBookedSlots(sortSlotsByDateAndTime([...bookedForCurrentUser]));

           // Process slots for the *selected availability date* using RELEVANT configurations
           const generatedDailySlots: BookableSlot[] = []; // Initialize for the date
           if (selectedAvailabilityDate && isValid(selectedAvailabilityDate)) { // Check date validity
                const relevantConfigs = findRelevantConfigurations(selectedAvailabilityDate, scheduleConfigurations); // Use imported helper
                if (relevantConfigs.length > 0) {
                    const formattedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');
                    const dayIndex = getDay(selectedAvailabilityDate);
                    const dayOfWeekString = daysOfWeek[dayIndex];
                    const isPastDate = isBefore(selectedAvailabilityDate, startOfDay(new Date()));

                    const professorExistingSlotsMap = new Map<string, BookableSlot>(
                         (allProfessorAvailability[currentUserEmail] || [])
                           .filter(slot => slot?.date === formattedDate && slot.duration === 60 && slot.professorEmail === currentUserEmail)
                           .map(slot => [slot.id, slot])
                     );

                    const potentialAssignments = new Set<string>();
                    relevantConfigs.forEach(config => {
                        Object.entries(config.schedule).forEach(([scheduleKey, assignment]) => {
                            const parts = scheduleKey.split('-');
                            if (parts.length < 3) return;
                            const day = parts[0];
                            const hourTime = parts[1];
                            const classroom = parts.slice(2).join('-');

                             if (day === dayOfWeekString && assignment.professor === currentUserEmail && hourTime?.endsWith(':00')) {
                                potentialAssignments.add(`${hourTime}-${classroom}`);
                            }
                        });
                    });

                    potentialAssignments.forEach(timeClassroomKey => {
                        const [hourTime, classroom] = timeClassroomKey.split('-');
                        const slotId = `${formattedDate}-${hourTime}-${classroom}-${currentUserEmail}`;
                        const existingSlotData = professorExistingSlotsMap.get(slotId);
                        // Make available by default if not explicitly set, unless it's guest
                        // GUEST handling is removed here as professor interface doesn't manage guest slots directly
                        const initialIsAvailable = existingSlotData?.isAvailable ?? false;

                         // Only show future slots or past booked slots
                         if (!isPastDate || (isPastDate && existingSlotData?.bookedBy)) {
                            generatedDailySlots.push({
                                id: slotId, date: formattedDate, day: dayOfWeekString, time: hourTime, classroom: classroom, duration: 60,
                                isAvailable: initialIsAvailable,
                                bookedBy: existingSlotData?.bookedBy ?? null,
                                bookingTime: existingSlotData?.bookingTime ?? null,
                                professorEmail: currentUserEmail,
                            });
                         }
                    });
                }
           }
            setDailySlots(sortSlotsByDateAndTime(generatedDailySlots));


           // --- Process data for "Book Lessons" Tab ---
            const loadedAllAvailableToBook: BookingViewSlot[] = [];
            const loadedMyBookings: BookingViewSlot[] = [];
            const processedBookedIds = new Set<string>();
            // assignedProfessorEmails is guaranteed non-null here by the initial check

            Object.entries(allProfessorAvailability).forEach(([profIdentifier, slots]) => {
                 // Check slots booked BY the current user first
                (slots || []).forEach(slot => {
                     if (slot?.id && slot.classroom && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                        const bookingViewSlot: BookingViewSlot = {
                            id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                            professorEmail: slot.professorEmail, // Keep the actual professor email or GUEST id
                            isBookedByCurrentUser: true,
                            bookingTime: slot.bookingTime || null,
                        };
                        loadedMyBookings.push(bookingViewSlot);
                        processedBookedIds.add(slot.id);
                    }
                });

                // Check slots from ASSIGNED professors OR GUEST for booking availability
                if (assignedProfessorEmails.includes(profIdentifier) || profIdentifier === GUEST_IDENTIFIER) {
                    (slots || []).forEach(slot => {
                         if (!(slot?.id && slot.classroom && slot.professorEmail === profIdentifier && slot.duration === 60 && slot.date && slot.time && slot.day && typeof slot.isAvailable !== 'undefined')) {
                             return;
                         }

                         try {
                             const slotDateObj = parseISO(slot.date);
                             if (!isValid(slotDateObj)) return;
                             const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                             if (!isValid(slotDateTime) || isBefore(slotDateTime, startOfDay(new Date()))) return;

                             const relevantBookingConfigs = findRelevantConfigurations(slotDateObj, scheduleConfigurations);
                             if (relevantBookingConfigs.length === 0) return;

                             const dayIndexBooking = getDay(slotDateObj);
                             const dayOfWeekBooking = daysOfWeek[dayIndexBooking];

                             const isActiveInAnyConfig = relevantBookingConfigs.some(config =>
                                  Object.entries(config.schedule).some(([key, assignment]) => {
                                      const [confDay, confTime, confClassroom] = key.split('-');
                                      return confDay && confTime && confClassroom &&
                                             confDay === dayOfWeekBooking &&
                                             confTime === slot.time &&
                                             confClassroom === slot.classroom &&
                                             assignment.professor === slot.professorEmail; // Use the email from the slot
                                  })
                             );
                             if (!isActiveInAnyConfig) return;

                             // Availability check: Guest slots are available if not booked, others require isAvailable flag
                             const isActuallyAvailable =
                                 profIdentifier === GUEST_IDENTIFIER
                                     ? !slot.bookedBy
                                     : slot.isAvailable && !slot.bookedBy;


                              if (isActuallyAvailable) {
                                   const bookingViewSlot: BookingViewSlot = {
                                       id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                                       professorEmail: slot.professorEmail, // Keep actual identifier
                                       isBookedByCurrentUser: false,
                                       bookingTime: null,
                                   };
                                   if (!loadedAllAvailableToBook.some(s => s.id === bookingViewSlot.id)) {
                                       loadedAllAvailableToBook.push(bookingViewSlot);
                                   }
                              }
                         } catch (parseError) {
                             console.warn(`Error processing slot ${slot?.id} for booking:`, parseError);
                             logError(parseError, `Professor Load Data (Booking Slot ${slot?.id})`);
                         }
                    });
                }
            });

            setAllAvailableSlotsToBook(sortSlotsByDateAndTime(loadedAllAvailableToBook));
            setMyBookedLessons(sortSlotsByDateAndTime(loadedMyBookings));

       } catch (error: any) {
           console.error("Failed to load availability/slot data for professor:", error);
           await logError(error, 'Professor Load Availability/Slots');
           toast({ variant: "destructive", title: "Errore Caricamento Dati", description: `Impossibile caricare i dati di disponibilità. Errore: ${error.message || 'Errore sconosciuto'}` });
           setDailySlots([]);
           setProfessorBookedSlots([]);
           setAllAvailableSlotsToBook([]);
           setMyBookedLessons([]);
       } finally {
           setIsLoading(false); // Final loading state set here
       }
   }, [currentUserEmail, assignedProfessorEmails, scheduleConfigurations, selectedAvailabilityDate, toast]); // Dependencies updated


   // Trigger data loading when essential data is ready or dates change
   useEffect(() => {
        loadAllData();
   }, [loadAllData]); // Dependency on the memoized loadAllData callback


   // Save function for professor's OWN availability
   const saveOwnAvailability = useCallback(async (updatedSlotsForDay: BookableSlot[]) => {
        if (currentUserEmail && selectedAvailabilityDate && isValid(selectedAvailabilityDate)) { // Check date validity
             setIsLoading(true); // Indicate saving
             try {
                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                let currentProfessorSlots = allAvailability[currentUserEmail] || [];
                const formattedSelectedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');

                 // Filter out invalid updated slots and ensure they belong to the current professor
                 const validUpdatedSlotsForDay = updatedSlotsForDay.filter(slot =>
                     slot && slot.id && slot.date && slot.time && slot.classroom && typeof slot.duration === 'number' && slot.professorEmail === currentUserEmail
                 );

                 // Merge: Keep slots from other dates, replace/add slots for the selected date
                 const slotsToKeep = currentProfessorSlots.filter(slot => slot?.date !== formattedSelectedDate);
                 const newProfessorSlots = [...slotsToKeep, ...validUpdatedSlotsForDay];

                 allAvailability[currentUserEmail] = sortSlotsByDateAndTime(newProfessorSlots);
                 await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);
                 console.log(`[Professor] Saved availability for ${currentUserEmail} on ${formattedSelectedDate}`);
             } catch(error: any) {
                  console.error("Failed to save own availability:", error);
                  await logError(error, 'Professor Save Own Availability'); // Log error
                  toast({ variant: "destructive", title: "Errore Salvataggio", description: `Impossibile salvare la disponibilità. Errore: ${error.message || 'Errore sconosciuto'}` });
                  // Consider reloading data on error to revert optimistic UI changes
                  await loadAllData();
             } finally {
                  setIsLoading(false);
             }
        } else {
            console.warn("[Professor] Cannot save availability, invalid state:", {currentUserEmail, selectedAvailabilityDate});
             toast({ variant: "destructive", title: "Errore Salvataggio", description: "Dati utente o data non validi." });
        }
   }, [currentUserEmail, selectedAvailabilityDate, toast, loadAllData]); // Added loadAllData


  const toggleSlotAvailability = async (id: string) => {
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedAvailabilityDate || !isValid(selectedAvailabilityDate)) { // Check date validity
       console.error("Slot non trovato o data non selezionata/valida:", {id, selectedAvailabilityDate});
        toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o data non valida." });
        return;
    }

    if (isBefore(selectedAvailabilityDate, startOfDay(new Date())) && !slotToToggle.bookedBy) {
         toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità per slot passati non prenotati." });
         return;
    }

     if (slotToToggle.bookedBy) {
        toast({ variant: "destructive", title: "Azione Negata", description: "Questo slot è prenotato. Cancella prima la prenotazione." });
        return;
     }

     // Guests cannot toggle availability - handled via booking/cancellation
     if (slotToToggle.professorEmail === GUEST_IDENTIFIER) {
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

               const slotIndex = professorSlots.findIndex(s => s?.id === slotId);
               if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

               const slotToCancel = professorSlots[slotIndex];
                let lessonDateTime; try { lessonDateTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                if (!isValid(lessonDateTime)) throw new Error("Data/ora lezione non valida.");
                if (isBefore(lessonDateTime, new Date())) {
                     toast({ variant: "default", title: "Info", description: "Non puoi cancellare una lezione passata." });
                     return;
                }
               const bookerEmail = slotToCancel.bookedBy;
               if (!bookerEmail) throw new Error("Slot non prenotato.");

               const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToCancel.time;
               const classroomInfo = slotToCancel.classroom;
               // Use GUEST_IDENTIFIER in title if applicable
               const professorDisplay = currentUserEmail === GUEST_IDENTIFIER ? 'Ospite' : `Prof. ${currentUserEmail}`;
               const eventTitle = `Lezione in ${classroomInfo} con ${professorDisplay}`;
               const { deleteLink } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitle, eventTitle, classroomInfo);

               // Update the slot state
               slotToCancel.bookedBy = null;
               slotToCancel.bookingTime = null;
               // Slot becomes available ONLY if it's a GUEST slot, otherwise requires manual activation
               slotToCancel.isAvailable = slotToCancel.professorEmail === GUEST_IDENTIFIER;

               allAvailability[currentUserEmail][slotIndex] = slotToCancel;
               await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

               // Send emails
               try {
                  await sendEmail({ to: bookerEmail, subject: 'Lezione Cancellata dal Professore', html: `<p>Ciao,</p><p>La tua lezione in ${classroomInfo} con ${professorDisplay} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLink}">Rimuovi dal Calendario</a></p>` });
                  // Don't send confirmation to the GUEST identifier
                  if (currentUserEmail !== GUEST_IDENTIFIER) {
                     await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione Effettuata', html: `<p>Ciao Prof. ${currentUserEmail},</p><p>Hai cancellato la prenotazione di ${bookerEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}. Lo slot ${slotToCancel.isAvailable ? 'è di nuovo disponibile' : 'rimane NON disponibile finché non lo riattivi'}.</p>` });
                  }
               } catch (emailError: any) {
                    console.error("Errore invio email cancellazione (prof):", emailError);
                    await logError(emailError, 'Professor Cancel Own Booking (Email)');
                    toast({ title: "Avviso", description: `Prenotazione cancellata, ma errore nell'invio email. Dettagli: ${emailError.message || 'Errore sconosciuto'}` });
                }

               toast({ title: "Prenotazione Cancellata", description: `Prenotazione da ${bookerEmail} cancellata. Lo slot è ora ${slotToCancel.isAvailable ? 'disponibile' : 'NON disponibile'}.` });
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
       if (currentUserEmail && assignedProfessorEmails) { // Check assignedProfessorEmails here
           setIsLoading(true);
           try {
               // Can book with assigned professors OR the GUEST identifier
                if (!assignedProfessorEmails.includes(slotToBook.professorEmail) && slotToBook.professorEmail !== GUEST_IDENTIFIER) {
                     throw new Error("Puoi prenotare solo slot di professori a te assegnati o slot Ospite.");
                }

                const slotDateObj = parseISO(slotToBook.date);
                 if (!isValid(slotDateObj)) throw new Error("Data slot non valida.");
                 const slotDateTime = parseISO(`${slotToBook.date}T${slotToBook.time}:00`);
                 if (!isValid(slotDateTime)) throw new Error("Data/ora slot non valida.");
                  if (isBefore(slotDateTime, new Date())) {
                       throw new Error("Non puoi prenotare uno slot nel passato.");
                  }

                const relevantBookingConfigs = findRelevantConfigurations(slotDateObj, scheduleConfigurations); // Use imported helper
                const dayIndexBooking = getDay(slotDateObj);
                const dayOfWeekBooking = daysOfWeek[dayIndexBooking];

                const isActiveInAnyConfig = relevantBookingConfigs.some(config =>
                     Object.entries(config.schedule).some(([key, assignment]) => {
                         const [confDay, confTime, confClassroom] = key.split('-');
                         return confDay && confTime && confClassroom &&
                                confDay === dayOfWeekBooking &&
                                confTime === slotToBook.time &&
                                confClassroom === slotToBook.classroom &&
                                assignment.professor === slotToBook.professorEmail; // Check against the actual professor/guest id
                     })
                );

                if (!isActiveInAnyConfig) {
                    throw new Error("Questo slot non è più valido secondo l'orario attuale.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                // Use the correct identifier (email or GUEST)
                const targetIdentifier = slotToBook.professorEmail;
                if (!allAvailability[targetIdentifier]) {
                    allAvailability[targetIdentifier] = [];
                }
                const targetProfessorSlots = allAvailability[targetIdentifier];

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToBook.id);

                let originalSlot: BookableSlot;
                if (slotIndex !== -1) {
                   originalSlot = targetProfessorSlots[slotIndex];
                   // Check if still available based on its type (guest vs regular)
                   const isStillAvailable = targetIdentifier === GUEST_IDENTIFIER
                       ? !originalSlot.bookedBy // Guest availability derived
                       : originalSlot.isAvailable && !originalSlot.bookedBy; // Others must be explicitly available

                   if (!isStillAvailable) {
                       throw new Error("Lo slot non è più disponibile.");
                   }
                } else if (targetIdentifier === GUEST_IDENTIFIER) {
                    // Guest slots might not pre-exist if never toggled/booked, create entry
                    console.log(`[Professor Booking] Creating new availability entry for guest slot ${slotToBook.id}`);
                    originalSlot = {
                        ...slotToBook, // Copy basic info
                        isAvailable: false, // Immediately mark as unavailable
                        bookedBy: null, // To be filled
                        bookingTime: null, // To be filled
                        day: daysOfWeek[getDay(parseISO(slotToBook.date))], // Ensure day name is correct
                        professorEmail: GUEST_IDENTIFIER, // Ensure professorEmail is GUEST identifier
                    };
                } else {
                    // If slot doesn't exist for a non-guest professor, something is wrong
                    throw new Error("Slot da prenotare non trovato nella disponibilità del professore.");
                }

                // Mark as booked by the current user
                originalSlot.bookedBy = currentUserEmail;
                originalSlot.bookingTime = new Date().toISOString();
                originalSlot.isAvailable = false; // Always false when booked

                // Update or add the slot in the target professor's list
                if (slotIndex !== -1) {
                    targetProfessorSlots[slotIndex] = originalSlot;
                } else {
                    targetProfessorSlots.push(originalSlot); // Add if it was newly created (for guest)
                }

                // Save the updated data
                allAvailability[targetIdentifier] = sortSlotsByDateAndTime(targetProfessorSlots);
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

               // Prepare email details
               const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToBook.time;
               const classroomInfo = slotToBook.classroom;
               const displayProfessorBooker = currentUserEmail;
               // Adjust display name for GUEST
               const displayProfessorTarget = slotToBook.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : `Prof. ${slotToBook.professorEmail}`;
               const eventTitleBooker = `Lezione in ${classroomInfo} con ${displayProfessorTarget}`;
               const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${displayProfessorBooker}`;
               const descriptionBooker = `Lezione prenotata con ${displayProfessorTarget} in ${classroomInfo}.`;
               const descriptionProfessor = `Lezione prenotata da Prof. ${displayProfessorBooker} in ${classroomInfo}.`;
               const { addLink: addLinkBooker } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleBooker, eventTitleBooker, classroomInfo, descriptionBooker);
               const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

                try {
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione con Collega', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessorTarget} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkBooker}">Aggiungi al Calendario</a></p>` });
                  // Don't send email to the GUEST identifier
                  if (slotToBook.professorEmail !== GUEST_IDENTIFIER) {
                     await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta da Collega', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dal Prof. ${displayProfessorBooker} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
                  }
                } catch (emailError: any) {
                    console.error("Errore invio email conferma (prof-prof):", emailError);
                    await logError(emailError, 'Professor Book Lesson (Email)');
                    toast({ title: "Avviso", description: `Prenotazione effettuata, ma errore nell'invio email. Dettagli: ${emailError.message || 'Errore sconosciuto'}` });
                }

               toast({ title: "Prenotazione Riuscita", description: `Lezione con ${displayProfessorTarget} prenotata.` });
               await loadAllData(); // Refresh all data

           } catch (error: any) {
                console.error("Errore prenotazione lezione con professore:", error);
                await logError(error, 'Professor Book Lesson (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Prenotazione", description: error.message || "Impossibile prenotare la lezione." });
                await loadAllData(); // Refresh even on error to ensure UI consistency
           } finally {
                setIsLoading(false);
           }
       } else {
            console.warn("[Professor] Cannot book lesson, invalid state:", {currentUserEmail, assignedProfessorEmails});
            toast({ variant: "destructive", title: "Errore", description: "Dati utente o professori assegnati non caricati." });
       }
   }, [currentUserEmail, assignedProfessorEmails, loadAllData, toast, scheduleConfigurations]); // Dependencies updated


   const cancelLessonWithProfessor = useCallback(async (slotToCancel: BookingViewSlot) => {
       if (currentUserEmail) {
            setIsLoading(true);
            try {
                let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                 if (!isValid(lessonStartTime)) throw new Error("Data/ora lezione non valida.");

                if (differenceInHours(lessonStartTime, new Date()) < 24) {
                    throw new Error("Impossibile cancellare meno di 24 ore prima.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                // Use the correct identifier (email or GUEST)
                const targetIdentifier = slotToCancel.professorEmail;
                const targetProfessorSlots = allAvailability[targetIdentifier];
                if (!targetProfessorSlots) throw new Error("Slot professore target non trovati.");

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToCancel.id);
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

                const originalSlot = targetProfessorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                // Reset booking info
                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                // Slot becomes available ONLY if it's a GUEST slot, otherwise it should be manually toggled by the owner professor
                originalSlot.isAvailable = targetIdentifier === GUEST_IDENTIFIER;

                // Update the target professor's list
                allAvailability[targetIdentifier][slotIndex] = originalSlot;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

                // Prepare email details
                const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
                const formattedTime = slotToCancel.time;
                const classroomInfo = slotToCancel.classroom;
                const displayProfessorBooker = currentUserEmail;
                // Adjust display name for GUEST
                const displayProfessorTarget = slotToCancel.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : `Prof. ${slotToCancel.professorEmail}`;
                const eventTitleBooker = `Lezione in ${classroomInfo} con ${displayProfessorTarget}`;
                const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${displayProfessorBooker}`;
                const { deleteLink: deleteLinkBooker } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleBooker, eventTitleBooker, classroomInfo);
                const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

                // Send emails
                try {
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione con Collega', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessorTarget} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkBooker}">Rimuovi dal Calendario</a></p>` });
                  // Don't send email to the GUEST identifier
                  if (slotToCancel.professorEmail !== GUEST_IDENTIFIER) {
                     await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata da Collega', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione del Prof. ${displayProfessorBooker} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata. Lo slot è di nuovo disponibile.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                  }
                } catch (emailError: any) {
                    console.error("Errore invio email cancellazione (prof-prof):", emailError);
                    await logError(emailError, 'Professor Cancel Lesson (Email)');
                    toast({ title: "Avviso", description: `Cancellazione effettuata, ma errore nell'invio email. Dettagli: ${emailError.message || 'Errore sconosciuto'}` });
                }

                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${displayProfessorTarget} è stata cancellata.` });
                await loadAllData(); // Refresh all data

            } catch (error: any) {
                console.error("Errore cancellazione lezione con professore:", error);
                await logError(error, 'Professor Cancel Lesson (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Cancellazione", description: error.message || "Impossibile cancellare la prenotazione." });
           } finally {
               setIsLoading(false);
           }
       } else {
           console.warn("[Professor] Cannot cancel lesson, invalid state:", {currentUserEmail});
           toast({ variant: "destructive", title: "Errore", description: "Utente non valido." });
       }
   }, [currentUserEmail, loadAllData, toast]); // Dependencies


   // Filter available slots based on the selected booking date
    const filteredAvailableSlotsToBook = selectedBookingDate && isValid(selectedBookingDate) // Check validity
      ? allAvailableSlotsToBook.filter(slot => slot.date === format(selectedBookingDate, 'yyyy-MM-dd'))
      : [];

   // Display loading indicator while fetching initial data or slot data
   if (isLoading) {
       return <div className="flex justify-center items-center h-screen"><p>Caricamento dati...</p></div>;
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
                                // Only disable truly past days where no booking exists
                                disabled={(date) => (!date || (isBefore(date, startOfDay(new Date())) && !professorBookedSlots.some(slot => slot.date === format(date, 'yyyy-MM-dd')))) || isLoading}
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">
                              Gestisci Slot per {selectedAvailabilityDate && isValid(selectedAvailabilityDate) ? format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data valida'}
                            </h3>
                            {isLoading ? <p>Caricamento slot...</p> : dailySlots.length === 0 ? (
                                <p className="text-muted-foreground p-4 text-center">
                                   {!selectedAvailabilityDate || !isValid(selectedAvailabilityDate) ? 'Seleziona una data valida.' : (isBefore(selectedAvailabilityDate, startOfDay(new Date())) ? "Non puoi gestire slot passati." : `Nessuno slot assegnato per te il ${daysOfWeek[getDay(selectedAvailabilityDate)]} da una configurazione valida.`)}
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
                                            if (!isValid(slotDateTime)) throw new Error("Invalid date/time");
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
                                                    // Display non-clickable "Prenotato" status here
                                                    <span className="text-muted-foreground font-normal px-1 italic">Prenotato</span>
                                                  ) : isPastAndNotBooked ? (
                                                      <span className="text-muted-foreground font-normal px-1 italic">Passato</span>
                                                 ) : (
                                                     // Show the availability toggle button
                                                     <Button
                                                         onClick={() => toggleSlotAvailability(slot.id)}
                                                         variant={slot.isAvailable ? 'destructive' : 'default'}
                                                         size="sm"
                                                         disabled={isLoading || slot.professorEmail === GUEST_IDENTIFIER} // Disable if guest
                                                         title={slot.professorEmail === GUEST_IDENTIFIER ? "Disponibilità gestita automaticamente per Ospite" : ""}
                                                         className={cn(
                                                             'text-white',
                                                             slot.isAvailable ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700',
                                                             slot.professorEmail === GUEST_IDENTIFIER && 'opacity-50 cursor-not-allowed'
                                                         )}
                                                     >
                                                         {slot.isAvailable ? 'Rendi Non Disp.' : 'Rendi Disp.'}
                                                     </Button>
                                                 )}
                                             </TableCell>
                                            <TableCell>
                                              {slot.bookedBy ? `Da ${slot.bookedBy}${slot.bookingTime && isValid(parseISO(slot.bookingTime)) ? ` (${format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it })})` : ''}` : '—'}
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
                           <CardTitle>Tutte le Tue Lezioni Prenotate con Te</CardTitle>
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
                                                 if (!isValid(lessonDateTime)) return <TableRow key={`booked-prof-${slot.id}`}><TableCell colSpan={7}>Data/ora lezione non valida</TableCell></TableRow>;
                                                const isPastLesson = isBefore(lessonDateTime, new Date());
                                               return (
                                                   <TableRow key={`booked-prof-${slot.id}`}>
                                                       <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                       <TableCell>{slot.time}</TableCell>
                                                       <TableCell>{slot.classroom}</TableCell>
                                                       <TableCell className="text-center">{slot.duration} min</TableCell>
                                                       <TableCell>{slot.bookedBy}</TableCell>
                                                       <TableCell>{slot.bookingTime && isValid(parseISO(slot.bookingTime)) ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}</TableCell>
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
                             <CardDescription>Seleziona una data per prenotare slot con i professori assegnati ({assignedProfessorEmails.join(', ')}) o slot Ospite.</CardDescription>
                         ) : (
                             <CardDescription>Nessun professore assegnato per prenotare lezioni (puoi prenotare solo slot Ospite).</CardDescription>
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
                                  disabled={(date) => !date || isBefore(date, startOfDay(new Date())) || isLoading}
                              />
                          </div>
                         <div>
                             <h3 className="text-lg font-semibold mb-3">Slot Disponibili per {selectedBookingDate && isValid(selectedBookingDate) ? format(selectedBookingDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data valida'}</h3>
                             {isLoading ? <p>Caricamento slot...</p> : !selectedBookingDate || !isValid(selectedBookingDate) ? (
                                     <p className="text-muted-foreground p-4 text-center">Seleziona una data valida.</p>
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
                                                             <TableCell>{slot.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : slot.professorEmail}</TableCell>
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
                                 <p className="text-muted-foreground p-4 text-center">Non hai prenotato nessuna lezione con altri professori o ospiti.</p>
                            ) : (
                                 <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                     <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                       {myBookedLessons.map((slot) => {
                                         if (!slot?.id) return null;
                                         let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`my-booked-${slot.id}`}><TableCell colSpan={6}>Dati slot non validi</TableCell></TableRow>; }
                                          if (!isValid(lessonDateTime)) return <TableRow key={`my-booked-${slot.id}`}><TableCell colSpan={6}>Data/ora lezione non valida</TableCell></TableRow>;
                                         const isPastLesson = isBefore(lessonDateTime, new Date());
                                         const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                                         return (
                                           <TableRow key={`my-booked-${slot.id}`}>
                                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell>{slot.time}</TableCell>
                                             <TableCell>{slot.classroom}</TableCell>
                                             <TableCell>{slot.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : slot.professorEmail}</TableCell>
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
