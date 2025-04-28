
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns'; // Import date-fns functions
import { it } from 'date-fns/locale'; // Import Italian locale
import type { UserData } from '@/types/user'; // Import UserData type

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

// Key for storing all professors' availability (date-specific slots)
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function StudentInterface() {
  const [allAvailableSlots, setAllAvailableSlots] = useState<StudentSlotView[]>([]); // State for ALL available slots
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]); // Still show all booked slots regardless of date
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null); // Changed state to handle array
  const {toast} = useToast();

   // Function to sort slots consistently by date then time
   const sortSlots = (slots: StudentSlotView[]) => {
      return slots.sort((a, b) => {
          // Defensive check for invalid slot data before sorting
          if (!a?.date || !b?.date || !a?.time || !b?.time) {
              console.warn('Tentativo di ordinare dati slot non validi:', a, b);
              return 0; // Avoid erroring, maintain relative order
          }
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          // Simple string comparison works for HH:00 format
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
               // Optionally redirect or show error message
               // router.push('/');
           }
         } catch (e) {
           console.error("Errore durante il parsing dei dati utente:", e);
         }
       } else {
         console.error("Nessun utente loggato.");
          // Optionally redirect or show error message
          // router.push('/');
       }
     }
   }, []);

  // Function to load slots based on assigned professors and all booked slots for the user
  const loadSlots = useCallback(() => {
     if (typeof window === 'undefined' || !currentUserEmail) {
         setAllAvailableSlots([]); // Clear all available slots
         setBookedSlots([]);
         return;
     }

     // Load all professors' availability (which now contains date-specific slots)
     const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
     let allProfessorAvailability: Record<string, any[]> = {}; // { professorEmail: [slot1, slot2, ...] }
     if (storedAvailability) {
         try {
             const parsedAvailability = JSON.parse(storedAvailability);
              if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
                  allProfessorAvailability = parsedAvailability; // Reset if invalid
              } else {
                 allProfessorAvailability = {};
              }
         } catch (e) {
             console.error("Impossibile analizzare allProfessorAvailability", e);
             allProfessorAvailability = {};
         }
     }

     const loadedAllAvailable: StudentSlotView[] = []; // Changed name
     const loadedBookedByUser: StudentSlotView[] = [];
     const processedBookedIds = new Set<string>(); // Keep track of booked slots added

     // Iterate through ALL professors to find slots available from ASSIGNED professors AND slots booked by the user
     Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
         slots.forEach(slot => {
             // Validate the slot structure read from storage, ensuring duration is 60
             if (slot && slot.id && slot.date && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail && slot.duration === 60) {
                const studentViewSlot: StudentSlotView = {
                    id: slot.id,
                    date: slot.date,
                    day: slot.day,
                    time: slot.time, // Should be like "08:00"
                    duration: 60, // Always 60 minutes
                    professorEmail: slot.professorEmail,
                    isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                    bookingTime: slot.bookingTime || null, // Pass booking time
                };

                 // Add to ALL AVAILABLE list if:
                 // 1. The professor marked it as available
                 // 2. It's not booked by anyone
                 // 3. The slot start time is not in the past
                 // 4. The slot's professor is one of the student's assigned professors
                 if (slot.isAvailable && !slot.bookedBy && assignedProfessorEmails && assignedProfessorEmails.includes(slot.professorEmail)) {
                     try {
                        const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`); // Combine date and time for comparison (e.g., 2025-04-28T08:00:00)
                         if (!isBefore(slotDateTime, new Date())) { // Check if the slot time is in the future
                              loadedAllAvailable.push(studentViewSlot); // Add to the main available list
                         }
                     } catch (parseError) {
                         console.warn(`Impossibile analizzare data/ora per lo slot ${slot.id}:`, parseError);
                     }
                 }

                 // Add to the user's BOOKED list if booked by them (regardless of professor assignment) and not already added
                 if (slot.bookedBy === currentUserEmail && !processedBookedIds.has(studentViewSlot.id)) {
                    loadedBookedByUser.push(studentViewSlot);
                    processedBookedIds.add(studentViewSlot.id);
                }
             } else if (slot && slot.duration !== 60) {
                 // Optionally log if we find slots with incorrect duration
             } else {
                  // Log if data structure is unexpected or incomplete
             }
         });
     });

      // Sort all available slots by date and then time
      setAllAvailableSlots(sortSlots(loadedAllAvailable));
      // Sort all booked slots for the user by date and then time
      setBookedSlots(sortSlots(loadedBookedByUser));

  }, [currentUserEmail, assignedProfessorEmails]); // Rerun when user or assigned professors change

  // Load slots on mount and when dependencies change
  useEffect(() => {
    loadSlots();
  }, [loadSlots]);


  // Function to book a slot
  const bookSlot = useCallback((slotToBook: StudentSlotView) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // Check if the slot's professor is in the student's assigned list
        if (!assignedProfessorEmails || !assignedProfessorEmails.includes(slotToBook.professorEmail)) {
             toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Puoi prenotare solo slot di professori a te assegnati." });
             loadSlots(); // Refresh list
             return;
        }

        // 1. Get the latest availability data
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, any[]> = {};
        try {
            const parsedAvailability = storedAvailability ? JSON.parse(storedAvailability) : {};
            if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
                 allProfessorAvailability = parsedAvailability;
            } else {
                allProfessorAvailability = {};
            }
        } catch (e) {
            console.error("Impossibile analizzare allProfessorAvailability prima della prenotazione", e);
            toast({ variant: "destructive", title: "Errore Prenotazione", description: "Impossibile caricare i dati dell'orario." });
            return;
        }

        // Find the specific professor's list of slots
        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots || !Array.isArray(professorSlots)) {
             toast({ variant: "destructive", title: "Errore Prenotazione", description: "Orario del professore non trovato." });
             return;
        }

        // Find the index of the specific slot to book
        const slotIndex = professorSlots.findIndex(s => s && s.id === slotToBook.id && s.duration === 60); // Ensure it's the correct slot ID and duration
        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Errore Prenotazione", description: "Slot non trovato o non valido." });
            loadSlots(); // Refresh list in case it's outdated
            return;
        }
        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available (isAvailable == true) and not booked (bookedBy == null) and not in the past
        let slotDateTime;
        try {
           slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
        } catch (parseError) {
            console.error("Impossibile analizzare data/ora durante il controllo della prenotazione:", parseError);
            toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Dati slot non validi." });
            loadSlots();
            return;
        }

        if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
             toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Lo slot non è più disponibile o è nel passato." });
             loadSlots(); // Refresh the list to show the current state
             return;
        }

        // 3. Update the slot data: mark as booked by current user and record time
        const now = new Date();
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = now.toISOString(); // Store booking time as ISO string
        // Mark isAvailable as false upon booking, professor manages true availability but this prevents double booking
        originalSlot.isAvailable = false;

        // 4. Save updated data back to localStorage
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots; // Update the professor's slot list
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // 5. Update UI state immediately by reloading slots
        loadSlots(); // Reload all slots to reflect the change

        toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata per il ${format(parseISO(slotToBook.date), 'dd/MM/yyyy')} alle ${slotToBook.time}.` });

    }
  }, [currentUserEmail, assignedProfessorEmails, loadSlots, toast]); // Include assignedProfessorEmails, loadSlots and toast

  // Function to cancel a booking
  const cancelBooking = useCallback((slotToCancel: StudentSlotView) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
            // 1. Get latest data
            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, any[]> = {};
            try {
                 const parsedAvailability = storedAvailability ? JSON.parse(storedAvailability) : {};
                 if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
                     allProfessorAvailability = parsedAvailability;
                 } else {
                    allProfessorAvailability = {};
                 }
            } catch (e) {
                 console.error("Impossibile analizzare allProfessorAvailability prima della cancellazione", e);
                 toast({ variant: "destructive", title: "Errore Cancellazione", description: "Impossibile caricare i dati dell'orario." });
                 return;
            }

           // Find the professor's slot list
           const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots || !Array.isArray(professorSlots)) {
                toast({ variant: "destructive", title: "Errore Cancellazione", description: "Orario del professore non trovato." });
                return;
           }

            // Find the specific slot index
            const slotIndex = professorSlots.findIndex(s => s && s.id === slotToCancel.id && s.duration === 60);
            if (slotIndex === -1) {
                toast({ variant: "destructive", title: "Errore Cancellazione", description: "Slot non trovato o non valido." });
                loadSlots(); // Refresh UI
                return;
            }
            const originalSlot = professorSlots[slotIndex];

           // 2. Verify the current user booked this slot
            if (originalSlot.bookedBy !== currentUserEmail) {
                 toast({ variant: "destructive", title: "Errore Cancellazione", description: "Non hai prenotato questo slot." });
                 loadSlots(); // Refresh UI just in case
                 return;
            }

            // --- 24-hour cancellation policy check ---
            let lessonStartTime;
            try {
                lessonStartTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
            } catch (parseError) {
                 console.error("Impossibile analizzare data/ora durante il controllo della cancellazione:", parseError);
                 toast({ variant: "destructive", title: "Cancellazione Fallita", description: "Dati slot non validi." });
                 loadSlots();
                 return;
            }
            const now = new Date();

            if (differenceInHours(lessonStartTime, now) < 24) {
                 toast({
                     variant: "destructive",
                     title: "Cancellazione Fallita",
                     description: "Impossibile cancellare una lezione meno di 24 ore prima.",
                     duration: 5000, // Show longer
                 });
                 return; // Stop cancellation
            }
            // --- End 24-hour check ---

           // 3. Update slot data: remove booking info, mark as available (professor ultimately controls true availability via their interface)
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           // IMPORTANT: Set isAvailable back to true, assuming the slot should become available again.
           // The professor can override this later if needed.
           originalSlot.isAvailable = true;

           // 4. Save updated data back to localStorage
           allProfessorAvailability[slotToCancel.professorEmail] = professorSlots; // Update the professor's list
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // 5. Update UI state immediately by reloading slots
           loadSlots(); // Reload all slots

           toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} il ${format(parseISO(slotToCancel.date), 'dd/MM/yyyy')} alle ${slotToCancel.time} è stata cancellata.` });

       }
   }, [currentUserEmail, loadSlots, toast]); // Include loadSlots and toast


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
        <CardContent className="grid gap-6"> {/* Removed md:grid-cols-2 */}

           {/* Available Slots */}
           <div>
             <h3 className="text-lg font-semibold mb-3">
                Slot Disponibili per la Prenotazione {assignedProfessorEmails ? `con i tuoi professori` : ''}
             </h3>
             {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                 allAvailableSlots.length === 0 ? (
                     <p className="text-muted-foreground p-4 text-center">
                         Nessuno slot da 60 minuti attualmente disponibile per la prenotazione con i tuoi professori.
                     </p>
                 ) : (
                      <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-32">Data</TableHead> {/* Added Date */}
                              <TableHead className="w-24">Ora</TableHead>
                              <TableHead>Professore</TableHead>
                              <TableHead className="w-20 text-center">Durata</TableHead>
                              <TableHead className="w-28 text-center">Azioni</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {allAvailableSlots.map((slot) => (
                                <TableRow key={`available-${slot.id}`}>
                                  <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy')}</TableCell>
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
           {/* Removed md:col-span-2 as we no longer have columns */}
           <div>
            <h3 className="text-lg font-semibold mb-3 mt-6">Le Tue Lezioni Prenotate</h3>
            {bookedSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">Non hai ancora prenotato nessuna lezione.</p>
            ) : (
                 <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead className="w-32">Data</TableHead>
                         <TableHead className="w-24">Ora</TableHead>
                         <TableHead>Professore</TableHead>
                         <TableHead className="w-20 text-center">Durata</TableHead>
                         <TableHead className="w-40 text-center">Azioni</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {bookedSlots.map((slot) => {
                        let lessonDateTime;
                        try {
                             lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                        } catch {
                             // Handle cases where date/time might be invalid temporarily
                             return <TableRow key={`booked-${slot.id}`}><TableCell colSpan={5}>Dati slot non validi</TableCell></TableRow>;
                        }

                         // Check if cancellation is allowed (more than 24 hours before)
                         const canCancel = differenceInHours(lessonDateTime, new Date()) >= 24;

                         // Construct each TableRow individually
                         return (
                           <TableRow key={`booked-${slot.id}`}>
                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy')}</TableCell>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell>{slot.professorEmail}</TableCell>
                             <TableCell className="text-center">{slot.duration} min</TableCell>
                             <TableCell className="text-center">
                               <Button
                                 onClick={() => cancelBooking(slot)}
                                 variant="destructive"
                                 size="sm"
                                 disabled={!canCancel} // Disable if within 24 hours
                                 title={!canCancel ? "Impossibile cancellare meno di 24 ore prima" : "Cancella questa prenotazione"}
                               >
                                 Cancella Prenotazione
                               </Button>
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
