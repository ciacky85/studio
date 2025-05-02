'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours, isWithinInterval, isValid } from 'date-fns'; // Added isValid
import { it } from 'date-fns/locale';
import type { UserData, AllUsersData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, BookingViewSlot } from '@/types/schedule'; // Use consistent types
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
const GUEST_PROFESSOR_EMAIL = 'ospite@creativeacademy.it'; // Guest Professor constant

export function StudentInterface() {
  const [allAvailableSlots, setAllAvailableSlots] = useState<BookingViewSlot[]>([]); // All available from assigned profs based on active schedule
  const [bookedSlots, setBookedSlots] = useState<BookingViewSlot[]>([]); // Slots booked BY THIS student
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
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
            if (userSessionData.role === 'student' && userSessionData.username) {
                 setCurrentUserEmail(userSessionData.username);
            } else {
                 console.error("Utente loggato non valido o non studente:", userSessionData);
            }
         } catch (e) {
           console.error("Errore parsing dati sessione:", e);
           logError(e, 'Student Mount (Parse Session)');
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


   // Function to load slots based on assigned professors, booked slots, and relevant schedule configurations
   const loadSlots = useCallback(async () => {
      if (!currentUserEmail) return;

      setIsLoading(true);
      try {
          // 1. Load assigned professors
          const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
          const currentUserData = allUsers[currentUserEmail];
          const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];
          setAssignedProfessorEmails(currentlyAssigned);
          // console.log(`[Student ${currentUserEmail}] Assigned Professors:`, currentlyAssigned);

          // 2. Load all schedule configurations
          const loadedConfigurations = await readData<AllScheduleConfigurations>(SCHEDULE_CONFIGURATIONS_FILE, []);
          setScheduleConfigurations(loadedConfigurations);
          // console.log(`[Student ${currentUserEmail}] Loaded Configurations:`, loadedConfigurations.length);

          // 3. Load all professor availability data
          const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
          // console.log(`[Student ${currentUserEmail}] Loaded Availability Data Keys:`, Object.keys(allProfessorAvailability));


          const loadedAllAvailable: BookingViewSlot[] = [];
          const loadedBookedByUser: BookingViewSlot[] = [];
          const processedBookedIds = new Set<string>();

          // Iterate through ALL professors' availability data (including GUEST)
          Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
              // console.log(`[Student ${currentUserEmail}] Processing professor: ${profEmail}`);
               // Check slots booked BY the current user first
               (slots || []).forEach(slot => {
                    if (slot?.id && slot.classroom && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                        const bookingViewSlot: BookingViewSlot = {
                            id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                            professorEmail: slot.professorEmail,
                            isBookedByCurrentUser: true,
                            bookingTime: slot.bookingTime || null,
                        };
                        loadedBookedByUser.push(bookingViewSlot);
                        processedBookedIds.add(slot.id);
                        // console.log(`[Student ${currentUserEmail}] Added MY booking: ${slot.id}`);

                    }
                });

               // Now check for AVAILABLE slots from ASSIGNED professors (or GUEST if assigned)
               if (currentlyAssigned.includes(profEmail)) {
                    // console.log(`[Student ${currentUserEmail}] Professor ${profEmail} is assigned. Checking slots...`);
                    (slots || []).forEach(slot => {
                         // Basic slot validation
                         if (!(slot?.id && slot.classroom && slot.professorEmail === profEmail && slot.duration === 60 && slot.date && slot.time && slot.day && typeof slot.isAvailable === 'boolean')) {
                             // console.warn(`[Student ${currentUserEmail}] Skipping invalid slot data for ${profEmail}:`, slot);
                             return; // Skip this slot if essential data is missing
                         }

                         try {
                             const slotDateObj = parseISO(slot.date);
                             if (!isValid(slotDateObj)) { // Check if date is valid
                                 // console.warn(`[Student ${currentUserEmail}] Invalid date for slot ${slot.id}:`, slot.date);
                                 return; // Skip invalid date
                             }

                             const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                            if (!isValid(slotDateTime)) { // Check if date+time is valid
                                 // console.warn(`[Student ${currentUserEmail}] Invalid date/time for slot ${slot.id}:`, `${slot.date}T${slot.time}:00`);
                                 return; // Skip invalid date/time
                             }

                             // Filter out past slots immediately
                             if (isBefore(slotDateTime, startOfDay(new Date()))) {
                                // console.log(`[Student ${currentUserEmail}] Skipping past slot: ${slot.id}`);
                                return;
                             }

                             // Check if the slot's date falls within *any* active configuration
                             const relevantConfigs = findRelevantConfigurations(slotDateObj, loadedConfigurations);
                             if (relevantConfigs.length === 0) {
                                // console.log(`[Student ${currentUserEmail}] No active config for slot ${slot.id} on date ${slot.date}`);
                                return; // Skip if no config covers this date
                             }

                             const dayOfWeek = format(slotDateObj, 'EEEE', { locale: it }); // Get day name for checking config

                             // Check if this specific slot (day-time-classroom-prof) is defined in ANY relevant config
                             // This confirms the *admin* scheduled this slot for the professor during this period
                             const isActiveInAnyConfig = relevantConfigs.some(config =>
                                  Object.entries(config.schedule).some(([key, assignment]) => {
                                      const [confDay, confTime, confClassroom] = key.split('-');
                                      // Ensure parts are valid before comparing
                                      return confDay && confTime && confClassroom &&
                                             confDay === dayOfWeek &&
                                             confTime === slot.time &&
                                             confClassroom === slot.classroom &&
                                             assignment.professor === slot.professorEmail;
                                  })
                             );

                             if (!isActiveInAnyConfig) {
                                 // console.log(`[Student ${currentUserEmail}] Slot ${slot.id} not scheduled by admin in active config for date ${slot.date}`);
                                 return; // Skip if not explicitly scheduled by admin in an active config
                             }

                             // Determine availability for the student:
                             // GUEST: Available if NOT booked. Ignore stored isAvailable.
                             // REGULAR professor: Available if isAvailable=true AND NOT booked.
                             const isActuallyAvailable =
                                  profEmail === GUEST_PROFESSOR_EMAIL
                                      ? !slot.bookedBy
                                      : slot.isAvailable && !slot.bookedBy; // CRITICAL: Check isAvailable flag from professor

                            // console.log(`[Student ${currentUserEmail}] Slot ${slot.id} - isAvailable: ${slot.isAvailable}, bookedBy: ${slot.bookedBy}, isActiveInConfig: ${isActiveInAnyConfig}, isActuallyAvailableForStudent: ${isActuallyAvailable}`);


                             // Add to list if available for the student
                             if (isActuallyAvailable) {
                                 const bookingViewSlot: BookingViewSlot = {
                                     id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                                     professorEmail: slot.professorEmail,
                                     isBookedByCurrentUser: false, // It's available, so not booked by current user
                                     bookingTime: null,
                                 };
                                 // Avoid adding duplicates if processed multiple times (shouldn't happen with current logic, but safe)
                                 if (!loadedAllAvailable.some(existing => existing.id === bookingViewSlot.id)) {
                                     loadedAllAvailable.push(bookingViewSlot);
                                     // console.log(`[Student ${currentUserEmail}] Added AVAILABLE slot to book: ${slot.id}`);

                                 }
                             }
                         } catch (parseError) {
                             console.warn(`[Student ${currentUserEmail}] Error processing slot ${slot?.id}:`, parseError);
                             logError(parseError, `Student Load Slots (Processing Slot ${slot?.id})`);
                         }
                    });
               } else {
                 // console.log(`[Student ${currentUserEmail}] Professor ${profEmail} is NOT assigned. Skipping availability check.`);
               }
          });


          setAllAvailableSlots(sortSlotsByDateAndTime(loadedAllAvailable));
          setBookedSlots(sortSlotsByDateAndTime(loadedBookedByUser));
          // console.log(`[Student ${currentUserEmail}] Finished loading. Available: ${loadedAllAvailable.length}, Booked by me: ${loadedBookedByUser.length}`);


      } catch (error) {
           console.error("Failed to load slots for student:", error);
           await logError(error, 'Student Load Slots'); // Log error
           toast({ variant: "destructive", title: "Errore Caricamento Slot", description: "Impossibile caricare gli slot disponibili." });
           setAllAvailableSlots([]);
           setBookedSlots([]);
           setAssignedProfessorEmails(null);
           setScheduleConfigurations([]); // Reset on error
      } finally {
          setIsLoading(false);
      }
   }, [currentUserEmail, toast, selectedDate, scheduleConfigurations]); // Included scheduleConfigurations


  // Load slots when currentUserEmail is set or selectedDate changes
  useEffect(() => {
     if (currentUserEmail) {
        loadSlots();
     }
  }, [currentUserEmail, selectedDate, loadSlots]); // Dependency on loadSlots ensures it reruns if needed


  // Function to book a slot
  const bookSlot = useCallback(async (slotToBook: BookingViewSlot) => {
    if (currentUserEmail) {
        setIsLoading(true);
        try {
            const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
            const currentUserData = allUsers[currentUserEmail];
            const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];
            if (!currentlyAssigned.includes(slotToBook.professorEmail)) {
                 throw new Error("Puoi prenotare solo slot di professori a te assegnati.");
            }

            // Check if the slot is still valid according to relevant schedule configurations
            const slotDateObj = parseISO(slotToBook.date);
             if (!isValid(slotDateObj)) throw new Error("Data slot non valida.");

            const relevantConfigs = findRelevantConfigurations(slotDateObj, scheduleConfigurations); // Use imported helper
            const isActiveInAnyConfig = relevantConfigs.some(config =>
                 Object.entries(config.schedule).some(([key, assignment]) => {
                    const [day, time, classroom] = key.split('-');
                    const dayOfWeek = format(slotDateObj, 'EEEE', { locale: it });
                    // Ensure parts are valid before comparing
                    return day && time && classroom &&
                           day === dayOfWeek &&
                           time === slotToBook.time &&
                           classroom === slotToBook.classroom &&
                           assignment.professor === slotToBook.professorEmail;
                })
            );
             if (!isActiveInAnyConfig) {
                throw new Error("Questo slot non è più valido secondo l'orario attuale.");
             }


            const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
            // Ensure the professor's array exists, especially for GUEST
            if (!allAvailability[slotToBook.professorEmail]) {
                 allAvailability[slotToBook.professorEmail] = [];
            }
            const professorSlots = allAvailability[slotToBook.professorEmail];

            const slotIndex = professorSlots.findIndex(s => s?.id === slotToBook.id); // Find by ID, even if it was just created

            let originalSlot: BookableSlot;

            if (slotIndex !== -1) {
                 // Slot exists in availability file
                 originalSlot = professorSlots[slotIndex];
                 let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                 if (!isValid(slotDateTime)) throw new Error("Data/ora slot non valida.");


                 // Check availability again (race condition)
                 const isStillAvailable = slotToBook.professorEmail === GUEST_PROFESSOR_EMAIL
                     ? !originalSlot.bookedBy // Guest is available if not booked
                     : originalSlot.isAvailable && !originalSlot.bookedBy; // Regular needs flag and no booking

                 if (!isStillAvailable || isBefore(slotDateTime, new Date())) {
                    throw new Error("Lo slot non è più disponibile o è nel passato.");
                 }
            } else if (slotToBook.professorEmail === GUEST_PROFESSOR_EMAIL) {
                 // Slot is for GUEST and doesn't exist in availability.json yet, create it
                 console.log(`[Student] Creating new availability entry for guest slot ${slotToBook.id}`);
                 originalSlot = {
                     ...slotToBook, // Copy data from the view slot
                     isAvailable: false, // Will be immediately booked
                     bookedBy: null, // Will be set below
                     bookingTime: null, // Will be set below
                 };
                 // No need to push here yet, will update/add below
            } else {
                 // Slot for regular professor not found in availability - this shouldn't happen if loadSlots is correct
                 throw new Error("Slot da prenotare non trovato nella disponibilità del professore.");
            }

            // --- Update Slot ---
            originalSlot.bookedBy = currentUserEmail;
            originalSlot.bookingTime = new Date().toISOString();
            originalSlot.isAvailable = false; // Always false after booking

            // --- Save Update ---
            if (slotIndex !== -1) {
                 professorSlots[slotIndex] = originalSlot; // Update existing
            } else {
                 professorSlots.push(originalSlot); // Add the newly created guest slot
            }
            // Sort the professor's slots after modification (optional but good practice)
            allAvailability[slotToBook.professorEmail] = sortSlotsByDateAndTime(professorSlots);
            await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

            // --- Send Emails ---
            const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
            const formattedTime = slotToBook.time;
            const classroomInfo = slotToBook.classroom;
            const displayProfessor = slotToBook.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : `Prof. ${slotToBook.professorEmail}`;
            const eventTitleStudent = `Lezione in ${classroomInfo} con ${displayProfessor}`;
            const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
            const descriptionStudent = `Lezione prenotata con ${displayProfessor} in ${classroomInfo}.`;
            const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
            const { addLink: addLinkStudent } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleStudent, eventTitleStudent, classroomInfo, descriptionStudent);
            const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

            try {
              await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessor} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkStudent}">Aggiungi al Calendario</a></p>` });
              // Don't send email to the GUEST account
              if (slotToBook.professorEmail !== GUEST_PROFESSOR_EMAIL) {
                await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dallo studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
              }
            } catch (emailError) {
                console.error("Errore invio email conferma (studente):", emailError);
                await logError(emailError, 'Student Book Slot (Email)');
                toast({ title: "Avviso", description: `Prenotazione effettuata, ma errore nell'invio email.` });
            }

            toast({ title: "Prenotazione Riuscita", description: `Lezione con ${displayProfessor} prenotata.` });
            await loadSlots(); // Refresh UI

        } catch (error: any) {
             console.error("Errore prenotazione slot:", error);
             await logError(error, 'Student Book Slot (Main Catch)'); // Log error
             toast({ variant: "destructive", title: "Errore Prenotazione", description: error.message || "Impossibile prenotare lo slot." });
             await loadSlots(); // Refresh UI even on error
        } finally {
             setIsLoading(false);
        }
    }
  }, [currentUserEmail, loadSlots, toast, scheduleConfigurations]); // Added scheduleConfigurations dependency


  // Function to cancel a booking
  const cancelBooking = useCallback(async (slotToCancel: BookingViewSlot) => {
       if (currentUserEmail) {
           setIsLoading(true);
           try {
                let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                 if (!isValid(lessonStartTime)) throw new Error("Data/ora slot non valida.");

                if (differenceInHours(lessonStartTime, new Date()) < 24) {
                    throw new Error("Impossibile cancellare meno di 24 ore prima.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                const professorSlots = allAvailability[slotToCancel.professorEmail];
                if (!professorSlots) throw new Error("Slot professore target non trovati.");

                const slotIndex = professorSlots.findIndex(s => s?.id === slotToCancel.id); // Find by ID
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

                const originalSlot = professorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                // Update slot - make available again (only for non-guest professors)
                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                // For Guest professor, availability is derived, keep isAvailable false
                // For regular professors, set it back to true.
                originalSlot.isAvailable = slotToCancel.professorEmail !== GUEST_PROFESSOR_EMAIL;


                // Save update for the target professor
                allAvailability[slotToCancel.professorEmail][slotIndex] = originalSlot;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

                 // Prepare email details
                 const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
                 const formattedTime = slotToCancel.time;
                 const classroomInfo = slotToCancel.classroom;
                 const displayProfessor = slotToCancel.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : `Prof. ${slotToCancel.professorEmail}`;
                 const eventTitleStudent = `Lezione in ${classroomInfo} con ${displayProfessor}`;
                 const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
                 const { deleteLink: deleteLinkStudent } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleStudent, eventTitleStudent, classroomInfo);
                 const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

                 // Send cancellation emails
                 try {
                   await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessor} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkStudent}">Rimuovi dal Calendario</a></p>` });
                   // Don't send email to the GUEST account
                   if (slotToCancel.professorEmail !== GUEST_PROFESSOR_EMAIL) {
                     await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione dello studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                   }
                 } catch (emailError) {
                    console.error("Errore invio email cancellazione (studente):", emailError);
                    await logError(emailError, 'Student Cancel Booking (Email)');
                    toast({ title: "Avviso", description: `Cancellazione effettuata, ma errore nell'invio email.` });
                 }


                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${displayProfessor} è stata cancellata.` });
                await loadSlots(); // Refresh UI

           } catch (error: any) {
                console.error("Errore cancellazione prenotazione:", error);
                await logError(error, 'Student Cancel Booking (Main Catch)'); // Log error
                toast({ variant: "destructive", title: "Errore Cancellazione", description: error.message || "Impossibile cancellare la prenotazione." });
           } finally {
                setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadSlots, toast]); // Dependencies

  // Filter available slots based on the selected date
  const filteredAvailableSlots = selectedDate
    ? allAvailableSlots.filter(slot => slot.date === format(selectedDate, 'yyyy-MM-dd'))
    : [];

   // Display loading indicator
   if (isLoading && !currentUserEmail) { // Show loading only if user is not yet identified or data is loading
      return <div className="flex justify-center items-center h-screen"><p>Caricamento...</p></div>;
   }

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Studente</CardTitle>
          {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
             <CardDescription>
                Seleziona una data per prenotare slot con i professori assegnati ({assignedProfessorEmails.join(', ')}).
             </CardDescription>
          ) : (
              <CardDescription>
                  Nessun professore assegnato. Contatta l'amministratore.
             </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
           <div className="flex justify-center">
             <Calendar
               locale={it}
               mode="single"
               selected={selectedDate}
               onSelect={setSelectedDate}
               className="rounded-md border"
               disabled={(date) => isBefore(date, startOfDay(new Date())) || isLoading}
             />
           </div>
           <div>
              <h3 className="text-lg font-semibold mb-3">
                 Slot Disponibili per {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data'}
              </h3>
              {isLoading ? <p>Caricamento slot...</p> : !assignedProfessorEmails || assignedProfessorEmails.length === 0 ? (
                  <p className="text-muted-foreground p-4 text-center">Nessun professore assegnato.</p>
              ) : !selectedDate ? (
                     <p className="text-muted-foreground p-4 text-center">Seleziona una data.</p>
              ) : filteredAvailableSlots.length === 0 ? (
                          <p className="text-muted-foreground p-4 text-center">Nessuno slot disponibile per la prenotazione in questa data.</p>
                      ) : (
                          <div className="overflow-x-auto border rounded-md max-h-96">
                            <Table>
                              <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-24">Ora</TableHead>
                                    <TableHead>Aula</TableHead>
                                    <TableHead>Professore</TableHead>
                                    <TableHead className="w-20 text-center">Durata</TableHead>
                                    <TableHead className="w-28 text-center">Azioni</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredAvailableSlots.map((slot) => (
                                    <TableRow key={`available-${slot.id}`}>
                                      <TableCell>{slot.time}</TableCell>
                                      <TableCell>{slot.classroom}</TableCell>
                                      <TableCell>{slot.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : slot.professorEmail}</TableCell>
                                      <TableCell className="text-center">{slot.duration} min</TableCell>
                                      <TableCell className="text-center">
                                        <Button onClick={() => bookSlot(slot)} size="sm" disabled={isLoading}>Prenota</Button>
                                      </TableCell>
                                    </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                      )}
            </div>
        </CardContent>
      </Card>

       <Card className="w-full mt-6">
         <CardHeader>
           <CardTitle>Le Tue Lezioni Prenotate</CardTitle>
           <CardDescription>Elenco di tutte le lezioni che hai prenotato.</CardDescription>
         </CardHeader>
         <CardContent>
           {isLoading ? <p>Caricamento prenotazioni...</p> : bookedSlots.length === 0 ? (
             <p className="text-muted-foreground p-4 text-center">Non hai ancora prenotato nessuna lezione.</p>
           ) : (
             <div className="overflow-x-auto border rounded-md max-h-96">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead className="w-32">Data</TableHead>
                     <TableHead className="w-24">Ora</TableHead>
                     <TableHead>Aula</TableHead>
                     <TableHead>Professore</TableHead>
                     <TableHead className="w-20 text-center">Durata</TableHead>
                     <TableHead className="w-40 text-center">Azioni</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {bookedSlots.map((slot) => {
                    if (!slot?.id) return null;
                    let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`booked-${slot.id}`}><TableCell colSpan={6}>Dati slot non validi</TableCell></TableRow>; }
                     if (!isValid(lessonDateTime)) return <TableRow key={`booked-${slot.id}`}><TableCell colSpan={6}>Data/ora lezione non valida</TableCell></TableRow>;
                    const isPastLesson = isBefore(lessonDateTime, new Date());
                    const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                    return (
                       <TableRow key={`booked-${slot.id}`}>
                         <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                         <TableCell>{slot.time}</TableCell>
                         <TableCell>{slot.classroom}</TableCell>
                         <TableCell>{slot.professorEmail === GUEST_PROFESSOR_EMAIL ? 'Ospite' : slot.professorEmail}</TableCell>
                         <TableCell className="text-center">{slot.duration} min</TableCell>
                         <TableCell className="text-center">
                           {isPastLesson ? (
                                <span className="text-muted-foreground italic">Lezione passata</span>
                           ) : (
                               <Button
                                   onClick={() => cancelBooking(slot)}
                                   variant="destructive"
                                   size="sm"
                                   disabled={!canCancel || isLoading}
                                   title={!canCancel ? "Impossibile cancellare meno di 24 ore prima" : "Cancella questa prenotazione"}
                               >
                                   Cancella Prenotazione
                               </Button>
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
    </div>
  );
}

