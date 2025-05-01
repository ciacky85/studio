
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns';
import { it } from 'date-fns/locale';
import type { UserData, AllUsersData } from '@/types/user'; // Import UserData types
import type { BookableSlot } from '@/types/bookable-slot'; // Import BookableSlot type
import type { AllProfessorAvailabilityData } from '@/types/app-data'; // Import centralized data types
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import { readData, writeData } from '@/services/data-storage'; // Import data storage service

// Define the structure of a slot as seen by the student
interface StudentSlotView {
  id: string; // 'YYYY-MM-DD-HH:00-ClassroomName-professorEmail' unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time (e.g., '08:00')
  classroom: string;
  duration: number; // Now always 60 min
  professorEmail: string;
  isBookedByCurrentUser: boolean;
  bookingTime: string | null; // ISO string, needed for cancellation check
}

// Constants for filenames and keys
const USERS_DATA_FILE = 'users';
const ALL_PROFESSOR_AVAILABILITY_FILE = 'allProfessorAvailability';
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Key for session storage

export function StudentInterface() {
  const [allAvailableSlots, setAllAvailableSlots] = useState<StudentSlotView[]>([]);
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const {toast} = useToast();

   // Function to sort slots consistently by date then time
   const sortSlotsByDateAndTime = <T extends { date: string; time: string }>(slots: T[]): T[] => {
      return slots.sort((a, b) => {
          if (!a?.date || !b?.date || !a?.time || !b?.time) {
              console.warn('Tentativo di ordinare dati slot non validi:', a, b);
              return 0;
          }
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.time.localeCompare(b.time);
      });
   };

   // Get current user email and assigned professors on mount
   useEffect(() => {
    const loadInitialData = async () => {
        if (typeof window !== 'undefined') {
            const storedUserSession = sessionStorage.getItem(LOGGED_IN_USER_KEY);
            if (storedUserSession) {
                try {
                    const sessionData = JSON.parse(storedUserSession);
                    if (sessionData.role === 'student') {
                        setCurrentUserEmail(sessionData.username);
                        // Load user data from file to get assigned professors
                        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
                        const studentData = allUsers[sessionData.username];
                        if (studentData) {
                            setAssignedProfessorEmails(Array.isArray(studentData.assignedProfessorEmails) ? studentData.assignedProfessorEmails : null);
                        } else {
                             console.warn("Dati specifici dello studente non trovati per:", sessionData.username);
                             setAssignedProfessorEmails(null);
                        }
                    } else {
                         console.error("L'utente loggato non è uno studente.");
                    }
                } catch (e) {
                    console.error("Errore durante il parsing dei dati utente/sessione:", e);
                }
            } else {
                console.error("Nessun utente loggato in sessione.");
            }
        }
    };
    loadInitialData();
   }, []);

  // Function to load slots based on assigned professors and booked slots for the user
  const loadSlots = useCallback(async () => {
     if (!currentUserEmail) { // No need to check assignedProfessorEmails here, load all first
         setAllAvailableSlots([]);
         setBookedSlots([]);
         return;
     }

     try {
         // Load all professors' availability
         const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});

         const loadedAllAvailable: StudentSlotView[] = [];
         const loadedBookedByUser: StudentSlotView[] = [];
         const processedBookedIds = new Set<string>();

         // Iterate through ALL professors
         Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
             (slots || []).forEach(slot => { // Handle potentially null/undefined slots array
                 // Validate the slot structure
                 if (slot && slot.id && slot.date && slot.day && slot.time && slot.classroom && typeof slot.isAvailable === 'boolean' && slot.professorEmail && slot.duration === 60) {
                    const studentViewSlot: StudentSlotView = {
                        id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                        professorEmail: slot.professorEmail,
                        isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                        bookingTime: slot.bookingTime || null,
                    };

                     // Add to ALL AVAILABLE list if conditions met
                     if (slot.isAvailable && !slot.bookedBy && assignedProfessorEmails && assignedProfessorEmails.includes(slot.professorEmail)) {
                         try {
                            const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                             if (!isBefore(slotDateTime, startOfDay(new Date()))) { // Filter past slots
                                  loadedAllAvailable.push(studentViewSlot);
                             }
                         } catch (parseError) { console.warn(`Impossibile analizzare data/ora per lo slot ${slot.id}:`, parseError); }
                     }

                     // Add to the user's BOOKED list if booked by them
                     if (slot.bookedBy === currentUserEmail && !processedBookedIds.has(studentViewSlot.id)) {
                        loadedBookedByUser.push(studentViewSlot);
                        processedBookedIds.add(studentViewSlot.id);
                    }
                 }
             });
         });

          setAllAvailableSlots(sortSlotsByDateAndTime(loadedAllAvailable));
          setBookedSlots(sortSlotsByDateAndTime(loadedBookedByUser));

     } catch (error) {
         console.error("Errore durante il caricamento degli slot:", error);
         toast({ variant: "destructive", title: "Errore Caricamento", description: "Impossibile caricare gli slot." });
         setAllAvailableSlots([]);
         setBookedSlots([]);
     }

  }, [currentUserEmail, assignedProfessorEmails, toast]); // Added toast

  // Load slots on mount and when dependencies change
  useEffect(() => {
    loadSlots();
  }, [loadSlots]);


  // Function to book a slot
  const bookSlot = useCallback(async (slotToBook: StudentSlotView) => {
    if (!currentUserEmail) return;

    try {
        // Check assignment again
        if (!assignedProfessorEmails || !assignedProfessorEmails.includes(slotToBook.professorEmail)) {
            throw new Error("Puoi prenotare solo slot di professori a te assegnati.");
        }

        const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots) throw new Error("Slot professore target non trovati.");

        const slotIndex = professorSlots.findIndex(s => s && s.id === slotToBook.id && s.duration === 60);
        if (slotIndex === -1) throw new Error("Slot non trovato o non più valido.");

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
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots;
        await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);

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
          await sendEmail({
            to: currentUserEmail,
            subject: 'Conferma Prenotazione Lezione',
            html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkStudent}">Aggiungi al Calendario</a></p>`,
          });
          await sendEmail({
            to: slotToBook.professorEmail,
            subject: 'Nuova Prenotazione Ricevuta',
            html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dallo studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>`,
          });
        } catch (emailError) {
           console.error("Errore invio email di conferma:", emailError);
           toast({ variant: "destructive", title: "Avviso Invio Email", description: "Prenotazione completata, ma errore nell'invio delle email di conferma.", duration: 7000 });
        }

        await loadSlots(); // Refresh UI

        toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata per il ${formattedDate} alle ${formattedTime} in ${classroomInfo}. Email di conferma inviate.` });

     } catch (error) {
         console.error("Errore durante la prenotazione dello slot:", error);
         toast({ variant: "destructive", title: "Errore Prenotazione", description: `Impossibile prenotare lo slot. ${error instanceof Error ? error.message : ''}` });
         // Reload data on error
         await loadSlots();
     }
  }, [currentUserEmail, assignedProfessorEmails, loadSlots, toast]); // Added dependencies

  // Function to cancel a booking
  const cancelBooking = useCallback(async (slotToCancel: StudentSlotView) => {
       if (!currentUserEmail) return;

        try {
            // 24-hour cancellation check
            let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
            if (differenceInHours(lessonStartTime, new Date()) < 24) {
                 throw new Error("Impossibile cancellare meno di 24 ore prima.");
            }

            const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
            const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots) throw new Error("Slot professore target non trovati per cancellazione.");

            const slotIndex = professorSlots.findIndex(s => s && s.id === slotToCancel.id && s.duration === 60);
            if (slotIndex === -1) throw new Error("Slot da cancellare non trovato o già cancellato.");

            const originalSlot = professorSlots[slotIndex];
            if (originalSlot.bookedBy !== currentUserEmail) throw new Error("Non puoi cancellare questa prenotazione.");

            // Update slot
            originalSlot.bookedBy = null;
            originalSlot.bookingTime = null;
            originalSlot.isAvailable = true; // Make available again

            // Save update for the target professor
            allProfessorAvailability[slotToCancel.professorEmail] = professorSlots;
            await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);

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
               await sendEmail({
                 to: currentUserEmail,
                 subject: 'Conferma Cancellazione Lezione',
                 html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkStudent}">Rimuovi dal Calendario</a></p>`,
               });
               await sendEmail({
                 to: slotToCancel.professorEmail,
                 subject: 'Prenotazione Cancellata',
                 html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione dello studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>`,
               });
             } catch (emailError) {
               console.error("Errore invio email di cancellazione:", emailError);
                toast({ variant: "destructive", title: "Avviso Invio Email", description: "Cancellazione completata, ma errore nell'invio delle email di notifica.", duration: 7000 });
             }

            await loadSlots(); // Refresh UI

            toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} il ${formattedDate} alle ${formattedTime} in ${classroomInfo} è stata cancellata.` });

        } catch (error) {
             console.error("Errore durante la cancellazione della prenotazione:", error);
             toast({ variant: "destructive", title: "Errore Cancellazione", description: `Impossibile cancellare la prenotazione. ${error instanceof Error ? error.message : ''}` });
             // Reload data on error
             await loadSlots();
        }
   }, [currentUserEmail, loadSlots, toast]); // Added dependencies

  // Filter available slots based on the selected date
  const filteredAvailableSlots = selectedDate
    ? allAvailableSlots.filter(slot => slot.date === format(selectedDate, 'yyyy-MM-dd'))
    : [];


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Studente</CardTitle>
          {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
             <CardDescription>
                Seleziona una data dal calendario per visualizzare e prenotare slot di lezione disponibili da 60 minuti con i tuoi professori assegnati ({assignedProfessorEmails.join(', ')}).
             </CardDescription>
          ) : (
              <CardDescription>
                  Non ti è stato ancora assegnato nessun professore. Contatta l'amministratore. Puoi comunque vedere le tue prenotazioni esistenti.
             </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">

           {/* Calendar */}
           <div className="flex justify-center">
             <Calendar
               locale={it}
               mode="single"
               selected={selectedDate}
               onSelect={setSelectedDate}
               className="rounded-md border"
               // Disable past dates
               disabled={(date) => isBefore(date, startOfDay(new Date()))}
             />
           </div>

           {/* Available Slots for Selected Date */}
           <div>
              <h3 className="text-lg font-semibold mb-3">
                 Slot Disponibili per {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data'}
              </h3>
              {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                  selectedDate ? (
                      filteredAvailableSlots.length === 0 ? (
                          <p className="text-muted-foreground p-4 text-center">
                              Nessuno slot da 60 minuti disponibile per la prenotazione in questa data.
                          </p>
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
                                        <Button onClick={() => bookSlot(slot)} size="sm">Prenota</Button>
                                      </TableCell>
                                    </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                      )
                  ) : (
                     <p className="text-muted-foreground p-4 text-center">
                        Seleziona una data dal calendario per vedere gli slot disponibili.
                     </p>
                  )
              ) : (
                  <p className="text-muted-foreground p-4 text-center">
                     Nessun professore assegnato. Impossibile visualizzare slot disponibili.
                  </p>
              )}
            </div>
        </CardContent>
      </Card>

       {/* Booked Slots Table (Always Visible) */}
       <Card className="w-full mt-6">
         <CardHeader>
           <CardTitle>Le Tue Lezioni Prenotate</CardTitle>
           <CardDescription>Elenco di tutte le lezioni che hai prenotato.</CardDescription>
         </CardHeader>
         <CardContent>
           {bookedSlots.length === 0 ? (
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
                                   disabled={!canCancel}
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
