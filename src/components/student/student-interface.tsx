
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours, isWithinInterval } from 'date-fns'; // Added isWithinInterval
import { it } from 'date-fns/locale';
import type { UserData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, BookingViewSlot } from '@/types/schedule'; // Import schedule types
import type { AllUsersData, AllProfessorAvailability } from '@/types/app-data'; // Import app data types
import type { ScheduleConfiguration, AllScheduleConfigurations } from '@/types/schedule-configuration'; // Import configuration types
import { readData, writeData } from '@/services/data-storage'; // Import data storage service
import { logError } from '@/services/logging'; // Import the error logging service

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_CONFIGURATIONS_FILE = 'scheduleConfigurations'; // Use configurations file
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)

// Helper function to find the active schedule configuration for a given date
const findActiveConfiguration = (date: Date, configurations: ScheduleConfiguration[]): ScheduleConfiguration | null => {
    if (!configurations || configurations.length === 0) {
        return null;
    }
    const targetDate = startOfDay(date);
    return configurations.find(config => {
        try {
            const startDate = startOfDay(parseISO(config.startDate));
            const endDate = startOfDay(parseISO(config.endDate));
            return isWithinInterval(targetDate, { start: startDate, end: endDate });
        } catch (e) {
            console.error(`Error parsing dates for configuration ${config.id}:`, e);
            return false;
        }
    }) || null;
};


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


   // Function to load slots based on assigned professors, booked slots, and active schedule configuration
   const loadSlots = useCallback(async () => {
      if (!currentUserEmail) return;

      setIsLoading(true);
      try {
          // 1. Load assigned professors
          const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
          const currentUserData = allUsers[currentUserEmail];
          const currentlyAssigned = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : [];
          setAssignedProfessorEmails(currentlyAssigned);

          // 2. Load all schedule configurations
          const loadedConfigurations = await readData<AllScheduleConfigurations>(SCHEDULE_CONFIGURATIONS_FILE, []);
          setScheduleConfigurations(loadedConfigurations);

          // 3. Load all professor availability data
          const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});

          const loadedAllAvailable: BookingViewSlot[] = [];
          const loadedBookedByUser: BookingViewSlot[] = [];
          const processedBookedIds = new Set<string>();

          // Iterate through all professors' availability
          Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
               // Only consider slots from assigned professors
               if (currentlyAssigned.includes(profEmail)) {
                    slots.forEach(slot => {
                         if (slot?.id && slot.classroom && typeof slot.isAvailable === 'boolean' && slot.professorEmail === profEmail && slot.duration === 60) {
                            const bookingViewSlot: BookingViewSlot = {
                                id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                                professorEmail: slot.professorEmail,
                                isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                                bookingTime: slot.bookingTime || null,
                            };

                             // Check if the slot is available, not booked, and within an active schedule configuration for its date
                            if (slot.isAvailable && !slot.bookedBy) {
                                try {
                                    const slotDateObj = parseISO(slot.date);
                                    const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                                    const activeConfig = findActiveConfiguration(slotDateObj, loadedConfigurations);

                                    // Check if the slot is defined in the active config for that day/time/classroom/professor
                                     const isActiveInConfig = activeConfig && Object.entries(activeConfig.schedule).some(([key, assignment]) => {
                                        const [day, time, classroom] = key.split('-');
                                        const dayOfWeek = format(slotDateObj, 'EEEE', { locale: it }); // Get day name in Italian
                                        return day === dayOfWeek && time === slot.time && classroom === slot.classroom && assignment.professor === slot.professorEmail;
                                    });


                                    if (!isBefore(slotDateTime, startOfDay(new Date())) && isActiveInConfig) {
                                         loadedAllAvailable.push(bookingViewSlot);
                                    }
                                } catch (parseError) { console.warn(`Parse error slot ${slot.id}:`, parseError); }
                            }
                         }
                    });
               }

                // Check slots booked BY the current user (regardless of assignment or schedule config, as they booked it previously)
                slots.forEach(slot => {
                     if (slot?.id && slot.classroom && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                         const bookingViewSlot: BookingViewSlot = {
                             id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                             professorEmail: slot.professorEmail,
                             isBookedByCurrentUser: true,
                             bookingTime: slot.bookingTime || null,
                         };
                         loadedBookedByUser.push(bookingViewSlot);
                         processedBookedIds.add(slot.id);
                     }
                 });

          });

          setAllAvailableSlots(sortSlotsByDateAndTime(loadedAllAvailable));
          setBookedSlots(sortSlotsByDateAndTime(loadedBookedByUser));

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
   }, [currentUserEmail, toast]); // Include toast


  // Load slots when currentUserEmail is set
  useEffect(() => {
     if (currentUserEmail) {
        loadSlots();
     }
  }, [currentUserEmail, loadSlots]); // Dependency on loadSlots ensures it reruns if needed


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

            // Check if the slot is still valid according to active schedule config
            const slotDateObj = parseISO(slotToBook.date);
            const activeConfig = findActiveConfiguration(slotDateObj, scheduleConfigurations);
             const isActiveInConfig = activeConfig && Object.entries(activeConfig.schedule).some(([key, assignment]) => {
                const [day, time, classroom] = key.split('-');
                const dayOfWeek = format(slotDateObj, 'EEEE', { locale: it });
                return day === dayOfWeek && time === slotToBook.time && classroom === slotToBook.classroom && assignment.professor === slotToBook.professorEmail;
            });
             if (!isActiveInConfig) {
                throw new Error("Questo slot non è più valido secondo l'orario attuale.");
             }


            const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
            const professorSlots = allAvailability[slotToBook.professorEmail];
            if (!professorSlots) throw new Error("Slot professore target non trovati.");

            const slotIndex = professorSlots.findIndex(s => s?.id === slotToBook.id && s.duration === 60);
            if (slotIndex === -1) throw new Error("Slot da prenotare non trovato.");

            const originalSlot = professorSlots[slotIndex];
            let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
            if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
                throw new Error("Lo slot non è più disponibile o è nel passato.");
            }

            // Update slot
            originalSlot.bookedBy = currentUserEmail;
            originalSlot.bookingTime = new Date().toISOString();
            originalSlot.isAvailable = false;

            // Save update for the target professor
            allAvailability[slotToBook.professorEmail] = professorSlots;
            await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

            // Prepare email details
            const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
            const formattedTime = slotToBook.time;
            const classroomInfo = slotToBook.classroom;
            const eventTitleStudent = `Lezione in ${classroomInfo} con Prof. ${slotToBook.professorEmail}`;
            const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
            const descriptionStudent = `Lezione prenotata con ${slotToBook.professorEmail} in ${classroomInfo}.`;
            const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
            const { addLink: addLinkStudent } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleStudent, eventTitleStudent, classroomInfo, descriptionStudent);
            const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

            // Send confirmation emails
            try {
              await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkStudent}">Aggiungi al Calendario</a></p>` });
              await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dallo studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
            } catch (emailError) {
                console.error("Errore invio email conferma (studente):", emailError);
                await logError(emailError, 'Student Book Slot (Email)');
                toast({ title: "Avviso", description: `Prenotazione effettuata, ma errore nell'invio email.` });
            }

            toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata.` });
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
                if (differenceInHours(lessonStartTime, new Date()) < 24) {
                    throw new Error("Impossibile cancellare meno di 24 ore prima.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                const professorSlots = allAvailability[slotToCancel.professorEmail];
                if (!professorSlots) throw new Error("Slot professore target non trovati.");

                const slotIndex = professorSlots.findIndex(s => s?.id === slotToCancel.id && s.duration === 60);
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");

                const originalSlot = professorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                // Update slot - make available again
                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                originalSlot.isAvailable = true;

                // Save update for the target professor
                allAvailability[slotToCancel.professorEmail] = professorSlots;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

                 // Prepare email details
                 const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
                 const formattedTime = slotToCancel.time;
                 const classroomInfo = slotToCancel.classroom;
                 const eventTitleStudent = `Lezione in ${classroomInfo} con Prof. ${slotToCancel.professorEmail}`;
                 const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
                 const { deleteLink: deleteLinkStudent } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleStudent, eventTitleStudent, classroomInfo);
                 const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

                 // Send cancellation emails
                 try {
                   await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkStudent}">Rimuovi dal Calendario</a></p>` });
                   await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione dello studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                 } catch (emailError) {
                    console.error("Errore invio email cancellazione (studente):", emailError);
                    await logError(emailError, 'Student Cancel Booking (Email)');
                    toast({ title: "Avviso", description: `Cancellazione effettuata, ma errore nell'invio email.` });
                 }


                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} è stata cancellata.` });
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
                                      <TableCell>{slot.professorEmail}</TableCell>
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
                    const isPastLesson = isBefore(lessonDateTime, new Date());
                    const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                    return (
                       <TableRow key={`booked-${slot.id}`}>
                         <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                         <TableCell>{slot.time}</TableCell>
                         <TableCell>{slot.classroom}</TableCell>
                         <TableCell>{slot.professorEmail}</TableCell>
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

    