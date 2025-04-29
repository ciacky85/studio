
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore, differenceInHours } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, ScheduleAssignment, BookingViewSlot } from '@/types/schedule'; // Import schedule types
import type { AllUsersData, AllProfessorAvailability, ClassroomSchedule } from '@/types/app-data'; // Import app data types
import { readData, writeData } from '@/services/data-storage'; // Import data storage service

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_DATA_FILE = 'schedule';
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)

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
                 // Optionally redirect or handle error
             }
          } catch (e) {
            console.error("Errore parsing dati sessione:", e);
          }
        } else {
            console.log("Nessuna sessione utente trovata.");
             // Optionally redirect to login
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

           // 2. Load the admin's schedule template
           const classroomSchedule = await readData<ClassroomSchedule>(SCHEDULE_DATA_FILE, {});

           // 3. Load all professor availability data
           const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});

           // --- Process data for "Manage Availability" Tab ---

           // Get the current professor's full list of OFFERED slots
           const professorOfferedSlots = allProfessorAvailability[currentUserEmail] || [];

           // Filter and sort slots where THIS professor WAS BOOKED
           const bookedForCurrentUser = professorOfferedSlots.filter(slot => slot?.bookedBy && slot.duration === 60);
           setProfessorBookedSlots(sortSlotsByDateAndTime([...bookedForCurrentUser]));

           // Process slots for the *selected availability date*
           if (selectedAvailabilityDate) {
               const formattedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');
               const dayIndex = getDay(selectedAvailabilityDate);
               const dayOfWeekString = daysOfWeek[dayIndex];
               const isPastDate = isBefore(selectedAvailabilityDate, startOfDay(new Date()));

               // Map existing slots for the selected date for lookup
               const professorExistingSlotsMap = new Map<string, BookableSlot>(
                   professorOfferedSlots
                       .filter(slot => slot?.date === formattedDate && slot.duration === 60 && slot.classroom)
                       .map(slot => [slot.id, slot])
               );

               // Generate potential slots based on admin schedule
               const generatedSlots: BookableSlot[] = [];
               Object.entries(classroomSchedule).forEach(([scheduleKey, assignment]) => {
                   const parts = scheduleKey.split('-');
                   if (parts.length < 3) return;
                   const day = parts[0];
                   const hourTime = parts[1];
                   const classroom = parts.slice(2).join('-');

                   if (day === dayOfWeekString && assignment.professor === currentUserEmail && hourTime?.endsWith(':00')) {
                       const slotId = `${formattedDate}-${hourTime}-${classroom}-${currentUserEmail}`;
                       const existingSlotData = professorExistingSlotsMap.get(slotId);

                       if (!isPastDate || existingSlotData?.bookedBy) {
                           generatedSlots.push({
                               id: slotId, date: formattedDate, day: dayOfWeekString, time: hourTime, classroom: classroom, duration: 60,
                               isAvailable: isPastDate ? false : (existingSlotData?.isAvailable ?? false),
                               bookedBy: existingSlotData?.bookedBy ?? null,
                               bookingTime: existingSlotData?.bookingTime ?? null,
                               professorEmail: currentUserEmail,
                           });
                       }
                   }
               });

               // Sort generated daily slots
               const sortedGeneratedSlots = generatedSlots.sort((a, b) => {
                   const timeCompare = a.time.localeCompare(b.time);
                   return timeCompare !== 0 ? timeCompare : a.classroom.localeCompare(b.classroom);
               });
               setDailySlots(sortedGeneratedSlots);
           } else {
               setDailySlots([]); // Clear if no date selected
           }


          // --- Process data for "Book Lessons" Tab ---
          const loadedAllAvailableToBook: BookingViewSlot[] = [];
          const loadedMyBookings: BookingViewSlot[] = [];
          const processedBookedIds = new Set<string>();
          const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : []; // Get current assignments

           Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
               // Check slots offered by ASSIGNED professors (excluding self)
               if (currentlyAssigned.includes(profEmail) && profEmail !== currentUserEmail) {
                   slots.forEach(slot => {
                        if (slot?.id && slot.classroom && typeof slot.isAvailable === 'boolean' && slot.professorEmail === profEmail && slot.duration === 60) {
                           const bookingViewSlot: BookingViewSlot = {
                               id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                               professorEmail: slot.professorEmail,
                               isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                               bookingTime: slot.bookingTime || null,
                           };
                            if (slot.isAvailable && !slot.bookedBy) {
                                try {
                                    const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                                    if (!isBefore(slotDateTime, startOfDay(new Date()))) {
                                        loadedAllAvailableToBook.push(bookingViewSlot);
                                    }
                                } catch (parseError) { console.warn(`Parse error slot ${slot.id}:`, parseError); }
                            }
                        }
                   });
               }
                // Check slots booked BY the current user (from ANY professor, excluding self)
                if (profEmail !== currentUserEmail) {
                    slots.forEach(slot => {
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
                }
           });

           setAllAvailableSlotsToBook(sortSlotsByDateAndTime(loadedAllAvailableToBook));
           setMyBookedLessons(sortSlotsByDateAndTime(loadedMyBookings));


       } catch (error) {
           console.error("Failed to load data for professor:", error);
           toast({ variant: "destructive", title: "Errore Caricamento Dati", description: "Impossibile caricare i dati necessari." });
           // Reset states on error
           setDailySlots([]);
           setProfessorBookedSlots([]);
           setAssignedProfessorEmails(null);
           setAllAvailableSlotsToBook([]);
           setMyBookedLessons([]);
       } finally {
           setIsLoading(false);
       }
   }, [currentUserEmail, selectedAvailabilityDate, toast]); // Include toast


  // Trigger data loading when currentUserEmail is set or selected dates change
  useEffect(() => {
      if(currentUserEmail) {
          loadAllData();
      }
  }, [currentUserEmail, selectedAvailabilityDate, selectedBookingDate, loadAllData]); // Add selectedBookingDate if filtering depends on it


   // Save function for professor's OWN availability
   const saveOwnAvailability = useCallback(async (updatedSlotsForDay: BookableSlot[]) => {
        if (currentUserEmail && selectedAvailabilityDate) {
             setIsLoading(true); // Indicate saving
             try {
                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                let currentProfessorSlots = allAvailability[currentUserEmail] || [];
                const formattedSelectedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');

                // Filter out old slots for the selected date and merge with valid new/updated ones
                 const validUpdatedSlotsForDay = updatedSlotsForDay.filter(slot => slot?.id && slot.date && slot.time && slot.classroom && slot.duration === 60);
                 const slotsToKeep = currentProfessorSlots.filter(slot => slot?.date !== formattedSelectedDate);
                 const newProfessorSlots = [...slotsToKeep, ...validUpdatedSlotsForDay];

                 // Validate, sort, and save
                 const validatedSlots = newProfessorSlots.filter(slot => slot?.date && slot.time && slot.classroom && slot.duration === 60);
                 allAvailability[currentUserEmail] = sortSlotsByDateAndTime(validatedSlots);
                 await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);
                 // No toast here, handled in the calling function (toggleSlotAvailability)
             } catch(error: any) {
                  console.error("Failed to save own availability:", error);
                  toast({ variant: "destructive", title: "Errore Salvataggio", description: "Impossibile salvare la disponibilità." });
             } finally {
                  setIsLoading(false);
             }
        }
   }, [currentUserEmail, selectedAvailabilityDate, toast]);


  const toggleSlotAvailability = async (id: string) => {
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedAvailabilityDate) { console.error("Slot non trovato o data non selezionata:", id); return; }
    if (slotToToggle.bookedBy) {
       toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità di uno slot prenotato." });
       return;
    }
     if (isBefore(selectedAvailabilityDate, startOfDay(new Date()))) {
          toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità per date passate." });
          return;
     }

    const updatedSlot = { ...slotToToggle, isAvailable: !slotToToggle.isAvailable };
    const updatedDailySlots = dailySlots.map((slot) => slot.id === id ? updatedSlot : slot);
    setDailySlots(updatedDailySlots); // Update UI immediately

    // Persist the change
    await saveOwnAvailability(updatedDailySlots); // Pass all VALID slots for the current day

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

               const slotIndex = professorSlots.findIndex(s => s?.id === slotId && s.duration === 60);
               if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

               const slotToCancel = professorSlots[slotIndex];
               const bookerEmail = slotToCancel.bookedBy;
               if (!bookerEmail) throw new Error("Slot non prenotato.");

               const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToCancel.time;
               const classroomInfo = slotToCancel.classroom;
               const eventTitle = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
               const { deleteLink } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitle, eventTitle, classroomInfo);

               // Update slot data
               const updatedSlot = { ...slotToCancel, bookedBy: null, bookingTime: null, isAvailable: true };
               professorSlots[slotIndex] = updatedSlot;

               // Save updated availability
               allAvailability[currentUserEmail] = professorSlots;
               await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

               // Send cancellation emails
               try {
                  await sendEmail({ to: bookerEmail, subject: 'Lezione Cancellata dal Professore', html: `<p>Ciao,</p><p>La tua lezione in ${classroomInfo} con il Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata dal professore.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLink}">Rimuovi dal Calendario</a></p>` });
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione Effettuata', html: `<p>Ciao Prof. ${currentUserEmail},</p><p>Hai cancellato la prenotazione di ${bookerEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}. Lo slot è di nuovo disponibile.</p>` });
               } catch (emailError) { console.error("Errore invio email cancellazione (prof):", emailError); /* Toast warning? */ }

               toast({ title: "Prenotazione Cancellata", description: `Prenotazione da ${bookerEmail} cancellata. Lo slot è di nuovo disponibile.` });
               await loadAllData(); // Refresh all data

           } catch (error: any) {
                console.error("Errore cancellazione prenotazione propria:", error);
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
                // Re-check assignment before booking
                const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
                const currentUserData = allUsers[currentUserEmail];
                const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];
                if (!currentlyAssigned.includes(slotToBook.professorEmail)) {
                     throw new Error("Puoi prenotare solo slot di professori a te assegnati.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                const targetProfessorSlots = allAvailability[slotToBook.professorEmail];
                if (!targetProfessorSlots) throw new Error("Slot professore target non trovati.");

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToBook.id && s.duration === 60);
                if (slotIndex === -1) throw new Error("Slot da prenotare non trovato.");

                const originalSlot = targetProfessorSlots[slotIndex];
                let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
                    throw new Error("Lo slot non è più disponibile o è nel passato.");
                }

                // Update slot
                originalSlot.bookedBy = currentUserEmail;
                originalSlot.bookingTime = new Date().toISOString();
                originalSlot.isAvailable = false;

                // Save update for TARGET professor
                allAvailability[slotToBook.professorEmail] = targetProfessorSlots;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

               // Prepare email details
               const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
               const formattedTime = slotToBook.time;
               const classroomInfo = slotToBook.classroom;
               const eventTitleBooker = `Lezione in ${classroomInfo} con Prof. ${slotToBook.professorEmail}`;
               const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
               const descriptionBooker = `Lezione prenotata con ${slotToBook.professorEmail} in ${classroomInfo}.`;
               const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
               const { addLink: addLinkBooker } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleBooker, eventTitleBooker, classroomInfo, descriptionBooker);
               const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

               // Send confirmation emails
                try {
                  await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione con Collega', html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkBooker}">Aggiungi al Calendario</a></p>` });
                  await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta da Collega', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dal Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
                } catch (emailError) { console.error("Errore invio email conferma (prof-prof):", emailError); /* Toast warning? */ }


               toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata.` });
               await loadAllData(); // Refresh all data

           } catch (error: any) {
                console.error("Errore prenotazione lezione con professore:", error);
                toast({ variant: "destructive", title: "Errore Prenotazione", description: error.message || "Impossibile prenotare la lezione." });
                await loadAllData(); // Refresh even on error to ensure UI consistency
           } finally {
                setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadAllData, toast]); // Dependencies

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

                const slotIndex = targetProfessorSlots.findIndex(s => s?.id === slotToCancel.id && s.duration === 60);
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

                const originalSlot = targetProfessorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                // Update slot
                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                originalSlot.isAvailable = true;

                // Save update for TARGET professor
                allAvailability[slotToCancel.professorEmail] = targetProfessorSlots;
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
                  await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata da Collega', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione del Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                } catch (emailError) { console.error("Errore invio email cancellazione (prof-prof):", emailError); /* Toast warning? */ }

                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} è stata cancellata.` });
                await loadAllData(); // Refresh all data

            } catch (error: any) {
                console.error("Errore cancellazione lezione con professore:", error);
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
                                disabled={(date) => isBefore(date, startOfDay(new Date())) && !professorBookedSlots.some(slot => slot.date === format(date, 'yyyy-MM-dd')) || isLoading}
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">
                              Gestisci Slot per {selectedAvailabilityDate ? format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it }) : 'Nessuna data selezionata'}
                            </h3>
                            {isLoading ? <p>Caricamento slot...</p> : dailySlots.length === 0 ? (
                                <p className="text-muted-foreground p-4 text-center">
                                   {selectedAvailabilityDate ? (isBefore(selectedAvailabilityDate, startOfDay(new Date())) ? "Impossibile gestire slot per date passate." : `Nessuno slot assegnato per te il ${daysOfWeek[getDay(selectedAvailabilityDate)]}.`) : 'Seleziona una data.'}
                                </p>
                            ) : (
                                <div className="overflow-x-auto border rounded-md max-h-96">
                                  <Table>
                                    <TableHeader><TableRow><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Stato</TableHead><TableHead className="w-40 text-center">Azioni</TableHead><TableHead>Info Prenotazione</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                      {dailySlots.map((slot) => {
                                        const isBooked = !!slot.bookedBy;
                                        const isPastSlot = selectedAvailabilityDate ? isBefore(selectedAvailabilityDate, startOfDay(new Date())) : false;
                                        const isPastAndNotBooked = isPastSlot && !isBooked; // Past and not booked means cannot interact
                                        const statusText = isBooked ? 'Prenotato' : (slot.isAvailable ? 'Disponibile' : 'Non Disponibile');
                                        const statusColor = isBooked ? 'text-gray-500' : (slot.isAvailable ? 'text-green-600' : 'text-red-600');

                                        return (
                                          <TableRow key={slot.id}>
                                            <TableCell>{slot.time}</TableCell>
                                            <TableCell>{slot.classroom}</TableCell>
                                            <TableCell className="text-center">{slot.duration} min</TableCell>
                                            <TableCell className={cn(statusColor, "font-medium")}>{statusText}</TableCell>
                                            <TableCell className="text-center">
                                                 {isBooked ? (
                                                     <span className="text-muted-foreground font-normal px-1 italic">Prenotato</span>
                                                 ) : isPastAndNotBooked ? (
                                                      <span className="text-muted-foreground font-normal px-1 italic">Passato</span>
                                                 ) : (
                                                     <Button
                                                         onClick={() => toggleSlotAvailability(slot.id)}
                                                         variant={slot.isAvailable ? 'destructive' : 'default'}
                                                         size="sm"
                                                         disabled={isLoading} // Disable while loading/saving
                                                         className={cn(
                                                             'text-white',
                                                             slot.isAvailable ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
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
                                                             <TableCell>{slot.professorEmail}</TableCell>
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
                                             <TableCell>{slot.professorEmail}</TableCell>
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
