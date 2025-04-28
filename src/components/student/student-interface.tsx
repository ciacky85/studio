
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns'; // Import date-fns functions
import { it } from 'date-fns/locale'; // Import Italian locale
import type { UserData } from '@/types/user'; // Import UserData type
import { sendEmail } from '@/services/email'; // Import the email service

// Define the structure of a slot as seen by the student (now 60 min)
interface StudentSlotView {
  id: string; // 'YYYY-MM-DD-HH:00-professorEmail' unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time (e.g., '08:00')
  duration: number; // Now always 60 min
  professorEmail: string;
  isBookedByCurrentUser: boolean;
  bookingTime: string | null; // ISO string, needed for cancellation check
}

// Define the structure of a bookable slot (full details from storage)
interface BookableSlot {
  id: string;
  date: string;
  day: string;
  time: string;
  duration: number;
  isAvailable: boolean;
  bookedBy: string | null;
  bookingTime: string | null;
  professorEmail: string;
}


// Key for storing all professors' availability (date-specific slots)
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function StudentInterface() {
  const [allAvailableSlots, setAllAvailableSlots] = useState<StudentSlotView[]>([]); // State for ALL available slots from assigned profs
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]); // Slots booked BY THIS student
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null); // Use array
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
     if (typeof window !== 'undefined') {
       const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
       if (storedUser) {
         try {
           const userData = JSON.parse(storedUser);
           if (userData.role === 'student') {
              setCurrentUserEmail(userData.username);
              // Get assigned professors from the student's specific data
              const studentDataString = localStorage.getItem(userData.username);
              if(studentDataString) {
                const studentData: UserData = JSON.parse(studentDataString);
                // Ensure assignedProfessorEmail is treated as an array or null
                setAssignedProfessorEmails(Array.isArray(studentData.assignedProfessorEmail) ? studentData.assignedProfessorEmail : null);
              } else {
                console.warn("Dati specifici dello studente non trovati per:", userData.username);
                setAssignedProfessorEmails(null);
              }
           } else {
               console.error("L'utente loggato non è uno studente.");
               // Optionally redirect
           }
         } catch (e) {
           console.error("Errore durante il parsing dei dati utente:", e);
         }
       } else {
         console.error("Nessun utente loggato.");
          // Optionally redirect
       }
     }
   }, []);

  // Function to load slots based on assigned professors and all booked slots for the user
  const loadSlots = useCallback(() => {
     if (typeof window === 'undefined' || !currentUserEmail) {
         setAllAvailableSlots([]);
         setBookedSlots([]);
         return;
     }

     // Load all professors' availability
     const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
     let allProfessorAvailability: Record<string, BookableSlot[]> = {};
     if (storedAvailability) { try { allProfessorAvailability = JSON.parse(storedAvailability); } catch (e) { console.error("Impossibile analizzare allProfessorAvailability", e); allProfessorAvailability = {}; }}

     const loadedAllAvailable: StudentSlotView[] = [];
     const loadedBookedByUser: StudentSlotView[] = [];
     const processedBookedIds = new Set<string>();

     // Iterate through ALL professors to find slots available from ASSIGNED professors AND slots booked by the user
     Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
         slots.forEach(slot => {
             // Validate the slot structure and ensure duration is 60
             if (slot && slot.id && slot.date && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail && slot.duration === 60) {
                const studentViewSlot: StudentSlotView = {
                    id: slot.id, date: slot.date, day: slot.day, time: slot.time, duration: 60,
                    professorEmail: slot.professorEmail,
                    isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                    bookingTime: slot.bookingTime || null,
                };

                 // Add to ALL AVAILABLE list if:
                 // 1. Marked available by professor
                 // 2. Not booked
                 // 3. Not in the past
                 // 4. Professor is assigned to this student
                 if (slot.isAvailable && !slot.bookedBy && assignedProfessorEmails && assignedProfessorEmails.includes(slot.professorEmail)) {
                     try {
                        const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                         if (!isBefore(slotDateTime, new Date())) {
                              loadedAllAvailable.push(studentViewSlot);
                         }
                     } catch (parseError) { console.warn(`Impossibile analizzare data/ora per lo slot ${slot.id}:`, parseError); }
                 }

                 // Add to the user's BOOKED list if booked by them (regardless of professor assignment)
                 if (slot.bookedBy === currentUserEmail && !processedBookedIds.has(studentViewSlot.id)) {
                    loadedBookedByUser.push(studentViewSlot);
                    processedBookedIds.add(studentViewSlot.id);
                }
             }
         });
     });

      setAllAvailableSlots(sortSlotsByDateAndTime(loadedAllAvailable));
      setBookedSlots(sortSlotsByDateAndTime(loadedBookedByUser));

  }, [currentUserEmail, assignedProfessorEmails]); // Rerun when user or assigned professors change

  // Load slots on mount and when dependencies change
  useEffect(() => {
    loadSlots();
  }, [loadSlots]);


  // Function to book a slot
  const bookSlot = useCallback(async (slotToBook: StudentSlotView) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // Check assignment again just before booking
        if (!assignedProfessorEmails || !assignedProfessorEmails.includes(slotToBook.professorEmail)) {
             toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Puoi prenotare solo slot di professori a te assegnati." });
             loadSlots(); return;
        }

        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, BookableSlot[]> = {};
        try { allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {}; } catch (e) {
            console.error("Errore analisi disponibilità:", e);
            toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati di disponibilità." });
            return;
        }

        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots) {
            console.error("Slot professore target non trovati:", slotToBook.professorEmail);
            toast({ variant: "destructive", title: "Errore", description: "Slot professore non trovati." });
            return;
         }

        const slotIndex = professorSlots.findIndex(s => s && s.id === slotToBook.id && s.duration === 60);
        if (slotIndex === -1) {
             console.error("Slot da prenotare non trovato nella lista del professore target:", slotToBook.id);
             toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o non più valido." });
             loadSlots();
             return;
        }

        const originalSlot = professorSlots[slotIndex];

        // Check availability, not booked, not past
        let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch {
             console.error("Errore analisi data/ora slot");
             toast({ variant: "destructive", title: "Errore", description: "Formato data/ora slot non valido." });
             return;
         }
        if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
             toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Lo slot non è più disponibile o è nel passato." });
             loadSlots(); return;
        }

        // Update slot
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = new Date().toISOString();
        originalSlot.isAvailable = false;

        // Save update for the target professor
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots;
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // Prepare email details
        const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
        const formattedTime = slotToBook.time;

        // Send confirmation emails
        try {
          // Email to Student
          await sendEmail({
            to: currentUserEmail,
            subject: 'Conferma Prenotazione Lezione',
            html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p>`,
          });

          // Email to Professor
          await sendEmail({
            to: slotToBook.professorEmail,
            subject: 'Nuova Prenotazione Ricevuta',
            html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dallo studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime}.</p>`,
          });
        } catch (emailError) {
           console.error("Errore invio email di conferma:", emailError);
           // Show a warning toast, but the booking itself is successful
           toast({
              variant: "destructive", // Or use a "warning" variant if available
              title: "Avviso Invio Email",
              description: "Prenotazione completata, ma si è verificato un errore nell'invio delle email di conferma.",
              duration: 7000 // Longer duration for warnings
           });
        }


        loadSlots(); // Refresh UI

        toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata per il ${formattedDate} alle ${formattedTime}. Email di conferma inviate.` });
    }
  }, [currentUserEmail, assignedProfessorEmails, loadSlots, toast]);

  // Function to cancel a booking
  const cancelBooking = useCallback(async (slotToCancel: StudentSlotView) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
            // 24-hour cancellation check
            let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch {
                console.error("Errore analisi ora inizio lezione");
                toast({ variant: "destructive", title: "Errore", description: "Formato data/ora slot non valido." });
                return;
            }
            if (differenceInHours(lessonStartTime, new Date()) < 24) {
                 toast({ variant: "destructive", title: "Cancellazione Fallita", description: "Impossibile cancellare meno di 24 ore prima.", duration: 5000 });
                 return;
            }

            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, BookableSlot[]> = {};
            try { allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {}; } catch (e) {
                 console.error("Errore analisi disponibilità:", e);
                 toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati di disponibilità." });
                 return;
            }

            const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots) {
                console.error("Slot professore target non trovati per cancellazione:", slotToCancel.professorEmail);
                toast({ variant: "destructive", title: "Errore", description: "Slot professore non trovati." });
                return;
            }

            const slotIndex = professorSlots.findIndex(s => s && s.id === slotToCancel.id && s.duration === 60);
            if (slotIndex === -1) {
                 console.error("Slot da cancellare non trovato nella lista del professore target:", slotToCancel.id);
                 toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o già cancellato." });
                 loadSlots();
                 return;
            }

            const originalSlot = professorSlots[slotIndex];

            // Verify user booked this
            if (originalSlot.bookedBy !== currentUserEmail) {
                 console.warn("Tentativo di cancellare una prenotazione non effettuata dall'utente corrente.");
                 toast({ variant: "destructive", title: "Errore", description: "Non puoi cancellare questa prenotazione." });
                 loadSlots(); return;
             }

            // Update slot
            originalSlot.bookedBy = null;
            originalSlot.bookingTime = null;
            originalSlot.isAvailable = true; // Make available again

            // Save update for the target professor
            allProfessorAvailability[slotToCancel.professorEmail] = professorSlots;
            localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

             // Prepare email details
             const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
             const formattedTime = slotToCancel.time;

             // Send cancellation emails
             try {
               // Email to Student
               await sendEmail({
                 to: currentUserEmail,
                 subject: 'Conferma Cancellazione Lezione',
                 html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p>`,
               });

               // Email to Professor
               await sendEmail({
                 to: slotToCancel.professorEmail,
                 subject: 'Prenotazione Cancellata',
                 html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione dello studente ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p>`,
               });
             } catch (emailError) {
               console.error("Errore invio email di cancellazione:", emailError);
                toast({
                   variant: "destructive", // Or use a "warning" variant
                   title: "Avviso Invio Email",
                   description: "Cancellazione completata, ma si è verificato un errore nell'invio delle email di notifica.",
                   duration: 7000
                });
             }


            loadSlots(); // Refresh UI

            toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} il ${formattedDate} alle ${formattedTime} è stata cancellata.` });
       }
   }, [currentUserEmail, loadSlots, toast]);


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Studente</CardTitle>
          {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
             <CardDescription>
                Visualizza e prenota slot di lezione disponibili da 60 minuti con i tuoi professori assegnati ({assignedProfessorEmails.join(', ')}) o gestisci le tue prenotazioni.
             </CardDescription>
          ) : (
              <CardDescription>
                  Non ti è stato ancora assegnato nessun professore. Contatta l'amministratore. Puoi comunque vedere le tue prenotazioni esistenti.
             </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-6">

           {/* Available Slots */}
           <div>
             <h3 className="text-lg font-semibold mb-3">
                Slot Disponibili per la Prenotazione
             </h3>
             {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                 allAvailableSlots.length === 0 ? (
                     <p className="text-muted-foreground p-4 text-center">
                         Nessuno slot da 60 minuti attualmente disponibile per la prenotazione con i tuoi professori.
                     </p>
                 ) : (
                      <div className="overflow-x-auto border rounded-md max-h-96">
                        <Table>
                          <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-28 text-center">Azioni</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {allAvailableSlots.map((slot) => (
                                <TableRow key={`available-${slot.id}`}>
                                  <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                  <TableCell>{slot.time}</TableCell>
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
                    Nessun professore assegnato. Impossibile visualizzare slot disponibili.
                 </p>
             )}
           </div>

           {/* Booked Slots (Always Visible) */}
           <div>
            <h3 className="text-lg font-semibold mb-3 mt-6">Le Tue Lezioni Prenotate</h3>
            {bookedSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">Non hai ancora prenotato nessuna lezione.</p>
            ) : (
                 <div className="overflow-x-auto border rounded-md max-h-96">
                   <Table>
                     <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                     <TableBody>
                       {bookedSlots.map((slot) => {
                        let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`booked-${slot.id}`}><TableCell colSpan={5}>Dati slot non validi</TableCell></TableRow>; }
                        const canCancel = differenceInHours(lessonDateTime, new Date()) >= 24;
                        return (
                           <TableRow key={`booked-${slot.id}`}>
                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell>{slot.professorEmail}</TableCell>
                             <TableCell className="text-center">{slot.duration} min</TableCell>
                             <TableCell className="text-center">
                               <Button onClick={() => cancelBooking(slot)} variant="destructive" size="sm" disabled={!canCancel} title={!canCancel ? "Impossibile cancellare meno di 24 ore prima" : "Cancella questa prenotazione"}>Cancella Prenotazione</Button>
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
    </div>
  );
}

