
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours, isValid, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import type { UserData, AllUsersData } from '@/types/user';
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import type { BookableSlot, BookingViewSlot } from '@/types/schedule';
import type { AllProfessorAvailability, WeeklyScheduleData } from '@/types/app-data'; // Use WeeklyScheduleData
import { readData, writeData } from '@/services/data-storage';
import { logError } from '@/services/logging';

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const WEEKLY_SCHEDULE_DATA_FILE = 'weeklySchedule'; // Use weekly schedule file
const LOGGED_IN_USER_KEY = 'loggedInUser';
const GUEST_IDENTIFIER = 'GUEST';
const daysOfWeek = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export function StudentInterface() {
  const [allAvailableSlots, setAllAvailableSlots] = useState<BookingViewSlot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookingViewSlot[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null);
  const [weeklyScheduleData, setWeeklyScheduleData] = useState<WeeklyScheduleData>({}); // State for weekly schedule

  const {toast} = useToast();

   // Get current user email on mount
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
   }, []);


    // Load assigned professors and weekly schedule when currentUserEmail changes
   useEffect(() => {
      const loadInitialData = async () => {
          if (!currentUserEmail) return;

          setIsLoading(true);
          let assignedProfessors: string[] | null = null;
          let loadedWeeklySchedule: WeeklyScheduleData = {};

          try {
              // Load assigned professors
              const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
              const currentUserData = allUsers[currentUserEmail];
              assignedProfessors = Array.isArray(currentUserData?.assignedProfessorEmail) ? currentUserData.assignedProfessorEmail : null;
              console.log(`[Student ${currentUserEmail}] Loaded Assigned Professors:`, assignedProfessors);

              // Load weekly schedule data
              loadedWeeklySchedule = await readData<WeeklyScheduleData>(WEEKLY_SCHEDULE_DATA_FILE, {});
              console.log(`[Student ${currentUserEmail}] Loaded Weekly Schedule Data`);

          } catch (error) {
              console.error("Failed to load initial data for student:", error);
              await logError(error, 'Student Load Initial Data');
              toast({ variant: "destructive", title: "Errore Caricamento Dati", description: "Impossibile caricare i dati iniziali." });
              assignedProfessors = null;
              loadedWeeklySchedule = {};
          } finally {
             setAssignedProfessorEmails(assignedProfessors);
             setWeeklyScheduleData(loadedWeeklySchedule);
             // Loading will be set to false after loadSlots finishes
          }
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


   // Function to load slots based on assigned professors, booked slots, and weekly schedule
   const loadSlots = useCallback(async () => {
      // Wait until all necessary data is loaded
      if (!currentUserEmail || assignedProfessorEmails === null || Object.keys(weeklyScheduleData).length === 0) {
          return;
      }

      setIsLoading(true);
      try {
          const allProfessorAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});

          const loadedAllAvailable: BookingViewSlot[] = [];
          const loadedBookedByUser: BookingViewSlot[] = [];
          const processedBookedIds = new Set<string>();

          Object.entries(allProfessorAvailability).forEach(([profIdentifier, slots]) => {
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
                    }
                });

               // Check for AVAILABLE slots from ASSIGNED professors OR GUEST
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

                             // Check against weekly schedule for the specific date
                             const dateKey = format(slotDateObj, 'yyyy-MM-dd');
                             const timeClassroomKey = `${slot.time}-${slot.classroom}`;
                             const dayAssignment = weeklyScheduleData[dateKey]?.[timeClassroomKey];

                             if (dayAssignment?.professor !== slot.professorEmail) {
                                return; // Slot not active for this professor/guest on this date in the schedule
                             }

                             const isActuallyAvailable =
                                  profIdentifier === GUEST_IDENTIFIER
                                      ? !slot.bookedBy // Guest slots are available if not booked
                                      : slot.isAvailable && !slot.bookedBy; // Professor slots need to be explicitly available

                             if (isActuallyAvailable) {
                                 const bookingViewSlot: BookingViewSlot = {
                                     id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                                     professorEmail: slot.professorEmail,
                                     isBookedByCurrentUser: false,
                                     bookingTime: null,
                                 };
                                 if (!loadedAllAvailable.some(existing => existing.id === bookingViewSlot.id)) {
                                     loadedAllAvailable.push(bookingViewSlot);
                                 }
                             }
                         } catch (parseError) {
                             console.warn(`[Student ${currentUserEmail}] Error processing slot ${slot?.id}:`, parseError);
                             logError(parseError, `Student Load Slots (Processing Slot ${slot?.id})`);
                         }
                    });
               }
          });

          setAllAvailableSlots(sortSlotsByDateAndTime(loadedAllAvailable));
          setBookedSlots(sortSlotsByDateAndTime(loadedBookedByUser));

      } catch (error) {
           console.error("Failed to load slots for student:", error);
           await logError(error, 'Student Load Slots');
           toast({ variant: "destructive", title: "Errore Caricamento Slot", description: "Impossibile caricare gli slot disponibili." });
           setAllAvailableSlots([]);
           setBookedSlots([]);
      } finally {
          setIsLoading(false);
      }
   }, [currentUserEmail, assignedProfessorEmails, weeklyScheduleData, toast]);


  // Load slots when initial data is ready
  useEffect(() => {
     if (currentUserEmail && assignedProfessorEmails !== null && Object.keys(weeklyScheduleData).length > 0) {
        loadSlots();
     }
  }, [currentUserEmail, assignedProfessorEmails, weeklyScheduleData, selectedDate, loadSlots]); // Also re-run if selectedDate changes


  // Function to book a slot
  const bookSlot = useCallback(async (slotToBook: BookingViewSlot) => {
    if (currentUserEmail && assignedProfessorEmails) {
        setIsLoading(true);
        try {
            if (!assignedProfessorEmails.includes(slotToBook.professorEmail) && slotToBook.professorEmail !== GUEST_IDENTIFIER) {
                 throw new Error("Puoi prenotare solo slot di professori a te assegnati o slot Ospite.");
            }

            const slotDateObj = parseISO(slotToBook.date);
            if (!isValid(slotDateObj)) throw new Error("Data slot non valida.");
            const slotDateTime = parseISO(`${slotToBook.date}T${slotToBook.time}:00`);
            if (!isValid(slotDateTime) || isBefore(slotDateTime, new Date())) {
               throw new Error("Non puoi prenotare uno slot nel passato o data/ora non valida.");
            }

            // Validate against weekly schedule
            const dateKey = format(slotDateObj, 'yyyy-MM-dd');
            const timeClassroomKey = `${slotToBook.time}-${slotToBook.classroom}`;
            const dayAssignment = weeklyScheduleData[dateKey]?.[timeClassroomKey];
            if (dayAssignment?.professor !== slotToBook.professorEmail) {
               throw new Error("Questo slot non è più attivo secondo l'orario settimanale.");
            }

            const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
            const targetIdentifier = slotToBook.professorEmail;
            if (!allAvailability[targetIdentifier]) {
                 allAvailability[targetIdentifier] = [];
            }
            const professorSlots = allAvailability[targetIdentifier];
            const slotIndex = professorSlots.findIndex(s => s?.id === slotToBook.id);

            let originalSlot: BookableSlot;
            if (slotIndex !== -1) {
                 originalSlot = professorSlots[slotIndex];
                 const isStillAvailable = targetIdentifier === GUEST_IDENTIFIER
                     ? !originalSlot.bookedBy
                     : originalSlot.isAvailable && !originalSlot.bookedBy;
                 if (!isStillAvailable) {
                    throw new Error("Lo slot non è più disponibile.");
                 }
            } else if (targetIdentifier === GUEST_IDENTIFIER) {
                 console.log(`[Student] Creating new availability entry for guest slot ${slotToBook.id}`);
                 originalSlot = {
                     ...slotToBook, isAvailable: false, bookedBy: null, bookingTime: null,
                     day: format(slotDateObj, 'EEEE', { locale: it }),
                     professorEmail: GUEST_IDENTIFIER,
                 };
            } else {
                 throw new Error("Slot da prenotare non trovato.");
            }

            originalSlot.bookedBy = currentUserEmail;
            originalSlot.bookingTime = new Date().toISOString();
            originalSlot.isAvailable = false;

            if (slotIndex !== -1) {
                 professorSlots[slotIndex] = originalSlot;
            } else {
                 professorSlots.push(originalSlot);
            }
            allAvailability[targetIdentifier] = sortSlotsByDateAndTime(professorSlots);
            await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

            const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
            const formattedTime = slotToBook.time;
            const classroomInfo = slotToBook.classroom;
            const displayProfessor = slotToBook.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : `Prof. ${slotToBook.professorEmail}`;
            const eventTitleStudent = `Lezione in ${classroomInfo} con ${displayProfessor}`;
            const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
            const descriptionStudent = `Lezione prenotata con ${displayProfessor} in ${classroomInfo}.`;
            const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
            const { addLink: addLinkStudent } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleStudent, eventTitleStudent, classroomInfo, descriptionStudent);
            const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

            try {
              await sendEmail({ to: currentUserEmail, subject: 'Conferma Prenotazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessor} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkStudent}">Aggiungi al Calendario</a></p>` });
              if (slotToBook.professorEmail !== GUEST_IDENTIFIER) {
                await sendEmail({ to: slotToBook.professorEmail, subject: 'Nuova Prenotazione Ricevuta', html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dallo studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>` });
              }
            } catch (emailError) {
                console.error("Errore invio email conferma (studente):", emailError);
                await logError(emailError, 'Student Book Slot (Email)');
                toast({ title: "Avviso", description: `Prenotazione effettuata, ma errore nell'invio email.` });
            }

            toast({ title: "Prenotazione Riuscita", description: `Lezione con ${displayProfessor} prenotata.` });
            await loadSlots();

        } catch (error: any) {
             console.error("Errore prenotazione slot:", error);
             await logError(error, 'Student Book Slot (Main Catch)');
             toast({ variant: "destructive", title: "Errore Prenotazione", description: error.message || "Impossibile prenotare lo slot." });
             await loadSlots();
        } finally {
             setIsLoading(false);
        }
    }
  }, [currentUserEmail, assignedProfessorEmails, loadSlots, toast, weeklyScheduleData]);


  // Function to cancel a booking
  const cancelBooking = useCallback(async (slotToCancel: BookingViewSlot) => {
       if (currentUserEmail) {
           setIsLoading(true);
           try {
                let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
                 if (!isValid(lessonStartTime)) throw new Error("Data/ora lezione non valida.");
                if (differenceInHours(lessonStartTime, new Date()) < 24) {
                    throw new Error("Impossibile cancellare meno di 24 ore prima.");
                }

                const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
                const targetIdentifier = slotToCancel.professorEmail;
                const professorSlots = allAvailability[targetIdentifier];
                if (!professorSlots) throw new Error("Slot professore target non trovati.");
                const slotIndex = professorSlots.findIndex(s => s?.id === slotToCancel.id);
                if (slotIndex === -1) throw new Error("Slot da cancellare non trovato.");
                const originalSlot = professorSlots[slotIndex];
                if (originalSlot.bookedBy !== currentUserEmail) {
                   throw new Error("Non puoi cancellare questa prenotazione.");
                }

                originalSlot.bookedBy = null;
                originalSlot.bookingTime = null;
                originalSlot.isAvailable = targetIdentifier === GUEST_IDENTIFIER; // Only guests auto-available

                allAvailability[targetIdentifier][slotIndex] = originalSlot;
                await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

                 const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
                 const formattedTime = slotToCancel.time;
                 const classroomInfo = slotToCancel.classroom;
                 const displayProfessor = slotToCancel.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : `Prof. ${slotToCancel.professorEmail}`;
                 const eventTitleStudent = `Lezione in ${classroomInfo} con ${displayProfessor}`;
                 const eventTitleProfessor = `Lezione in ${classroomInfo} con Studente ${currentUserEmail}`;
                 const { deleteLink: deleteLinkStudent } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleStudent, eventTitleStudent, classroomInfo);
                 const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

                 try {
                   await sendEmail({ to: currentUserEmail, subject: 'Conferma Cancellazione Lezione', html: `<p>Ciao,</p><p>La tua lezione con ${displayProfessor} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkStudent}">Rimuovi dal Calendario</a></p>` });
                   if (slotToCancel.professorEmail !== GUEST_IDENTIFIER) {
                     await sendEmail({ to: slotToCancel.professorEmail, subject: 'Prenotazione Cancellata', html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione dello studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata. Lo slot ${originalSlot.isAvailable ? 'è di nuovo disponibile' : 'NON è automaticamente disponibile'}.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>` });
                   }
                 } catch (emailError) {
                    console.error("Errore invio email cancellazione (studente):", emailError);
                    await logError(emailError, 'Student Cancel Booking (Email)');
                    toast({ title: "Avviso", description: `Cancellazione effettuata, ma errore nell'invio email.` });
                 }

                toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${displayProfessor} è stata cancellata.` });
                await loadSlots();

           } catch (error: any) {
                console.error("Errore cancellazione prenotazione:", error);
                await logError(error, 'Student Cancel Booking (Main Catch)');
                toast({ variant: "destructive", title: "Errore Cancellazione", description: error.message || "Impossibile cancellare la prenotazione." });
           } finally {
                setIsLoading(false);
           }
       }
   }, [currentUserEmail, loadSlots, toast]);


  // Filter available slots based on the selected date
  const filteredAvailableSlots = selectedDate && isValid(selectedDate)
    ? allAvailableSlots.filter(slot => slot.date === format(selectedDate, 'yyyy-MM-dd'))
    : [];


   if (isLoading) {
      return <div className="flex justify-center items-center h-screen"><p>Caricamento...</p></div>;
   }

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Studente</CardTitle>
          {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
             <CardDescription>
                Seleziona una data per prenotare slot con i professori assegnati ({assignedProfessorEmails.join(', ')}) o slot Ospite.
             </CardDescription>
          ) : (
              <CardDescription>
                  Nessun professore assegnato. Puoi prenotare solo slot Ospite.
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
               disabled={(date) => !date || isBefore(date, startOfDay(new Date())) || isLoading}
             />
           </div>
           <div>
              <h3 className="text-lg font-semibold mb-3">
                 Slot Disponibili per {selectedDate && isValid(selectedDate) ? format(selectedDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data valida'}
              </h3>
              {isLoading ? <p>Caricamento slot...</p> : !selectedDate || !isValid(selectedDate) ? (
                     <p className="text-muted-foreground p-4 text-center">Seleziona una data valida.</p>
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
                                      <TableCell>{slot.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : slot.professorEmail}</TableCell>
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
                         <TableCell>{slot.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : slot.professorEmail}</TableCell>
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
