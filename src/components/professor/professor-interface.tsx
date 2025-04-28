
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore } from 'date-fns'; // Import date-fns functions
import { it } from 'date-fns/locale'; // Import Italian locale
import { cn } from "@/lib/utils"; // Import cn utility
import { Separator } from '@/components/ui/separator'; // Import Separator

// Define the structure of a bookable slot (now 60 mins) with date
interface BookableSlot {
  id: string; // Use 'YYYY-MM-DD-HH:00-professorEmail' as a unique identifier
  date: string; // 'YYYY-MM-DD' format
  day: string; // Day of the week (e.g., 'Monday')
  time: string; // Start time of the 60-min slot (e.g., '08:00')
  duration: number; // Now always 60 minutes
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student email if booked
  bookingTime: string | null; // ISO string timestamp of booking
  professorEmail: string; // Keep track of the professor
}

// Key for storing all professors' availability (now date-specific slots) in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for admin-defined classroom schedule (hourly template)
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

const daysOfWeek = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']; // Match getDay() output in Italian

export function ProfessorInterface() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()); // Default to today
  const [dailySlots, setDailySlots] = useState<BookableSlot[]>([]);
  const [professorBookedSlots, setProfessorBookedSlots] = useState<BookableSlot[]>([]); // State for booked slots for THIS professor
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

  // Get current user email on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.role === 'professor') {
            setCurrentUserEmail(userData.username);
          } else {
            console.error("L'utente loggato non è un professore.");
            // Optionally redirect or show error message
            // router.push('/'); // Example redirect
          }
        } catch (e) {
          console.error("Errore durante il parsing dei dati loggedInUser:", e);
        }
      } else {
         console.error("Nessun utente loggato.");
         // Optionally redirect or show error message
         // router.push('/'); // Example redirect
      }
    }
  }, []);

   // Function to sort slots consistently by date then time
   const sortSlots = (slots: BookableSlot[]) => {
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

  // Load/Generate slots when selectedDate or currentUserEmail changes
  const loadAndGenerateSlots = useCallback(() => {
    if (typeof window === 'undefined' || !currentUserEmail) {
      setDailySlots([]); // Clear slots if no user or on server
      setProfessorBookedSlots([]); // Clear booked slots as well
      return;
    }

    // 1. Load admin's hourly schedule template
    const storedSchedule = localStorage.getItem(CLASSROOM_SCHEDULE_KEY);
    let classroomSchedule: Record<string, string> = {}; // Key: "Day-HH:00", Value: Professor Email
    if (storedSchedule) {
      try {
        const parsedSchedule = JSON.parse(storedSchedule);
         if (typeof parsedSchedule === 'object' && parsedSchedule !== null) {
            classroomSchedule = parsedSchedule;
         } else {
            console.warn("Formato orario aule non valido trovato in localStorage.");
            classroomSchedule = {}; // Reset if invalid
         }
      } catch (e) {
        console.error("Impossibile analizzare classroomSchedule", e);
        classroomSchedule = {};
      }
    }

    // 2. Load all existing bookable slots (across all dates/professors) to get saved state
    const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
    let allProfessorAvailability: Record<string, BookableSlot[]> = {}; // Key: professorEmail
    if (storedAvailability) {
      try {
        const parsedAvailability = JSON.parse(storedAvailability);
         if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
             allProfessorAvailability = parsedAvailability; // Reset if invalid
         } else {
              console.warn("Formato allProfessorAvailability non valido trovato in localStorage.");
              allProfessorAvailability = {}; // Reset if invalid
         }
      } catch (e) {
        console.error("Impossibile analizzare allProfessorAvailability", e);
        allProfessorAvailability = {};
      }
    }

    // Get the current professor's full list of slots from the loaded data
    const professorSlots = allProfessorAvailability[currentUserEmail] || [];


    // 3. Filter and sort booked slots for the CURRENT professor
    const bookedForCurrentUser = professorSlots
      .filter(slot => slot && slot.bookedBy && slot.duration === 60); // Ensure duration is 60
    setProfessorBookedSlots(sortSlots([...bookedForCurrentUser])); // Set sorted booked slots for this professor (use spread)


    // 4. Process slots for the *selected date* (if a date is selected)
    if (!selectedDate) {
        setDailySlots([]);
        return; // No date selected, nothing to show in daily view
    }

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = getDay(selectedDate); // 0 for Sunday, 1 for Monday, etc.
    const dayOfWeekString = daysOfWeek[dayIndex];

     // Check if selected date is in the past for slot generation/display
     const isPastDate = isBefore(selectedDate, startOfDay(new Date()));

    // 5. Get existing slots specific to the current professor and selected date for quick lookup
    const professorExistingSlotsMap = new Map<string, BookableSlot>(
      professorSlots
        .filter(slot => slot && slot.date === formattedDate && slot.duration === 60) // Added check for slot existence and 60 min duration
        .map(slot => [slot.id, slot])
    );

    // 6. Generate potential 60-minute slots based ONLY on admin schedule assignments for this professor on the selected day
    const generatedSlots: BookableSlot[] = [];

    Object.entries(classroomSchedule).forEach(([hourlyKey, assignedEmail]) => {
      const [day, hourTime] = hourlyKey.split('-'); // e.g., "Lunedì", "08:00"

      // Check if the admin slot is for the selected day of the week AND assigned to the current professor
      if (day === dayOfWeekString && assignedEmail === currentUserEmail && hourTime.endsWith(':00')) {
        // Ensure we only process hourly slots from admin schedule
        const slotId = `${formattedDate}-${hourTime}-${currentUserEmail}`;

        // Retrieve existing saved data (isAvailable, bookedBy) for this specific slot ID if it exists
        const existingSlotData = professorExistingSlotsMap.get(slotId);

        // Only generate slots for the future (or today)
        if (!isPastDate) {
            // Create the slot object, defaulting availability to false if never saved before
            generatedSlots.push({
              id: slotId,
              date: formattedDate,
              day: dayOfWeekString,
              time: hourTime, // Use the hourly time directly (e.g., "08:00")
              duration: 60,   // Duration is always 60 minutes
              isAvailable: existingSlotData?.isAvailable ?? false, // Use saved status or default to false
              bookedBy: existingSlotData?.bookedBy ?? null,
              bookingTime: existingSlotData?.bookingTime ?? null,
              professorEmail: currentUserEmail,
            });
        }
      }
    });

    // Sort the generated daily slots by time
    generatedSlots.sort((a, b) => {
        // Defensive check for time property
        if (!a.time || !b.time) {
          return 0; // Maintain original order if time is missing
        }
        return a.time.localeCompare(b.time); // "08:00" sorts correctly
     });

    setDailySlots(generatedSlots);

  }, [selectedDate, currentUserEmail]); // Rerun when date or user changes

  // Trigger slot loading/generation on initial mount and when dependencies change
  useEffect(() => {
    loadAndGenerateSlots();
  }, [loadAndGenerateSlots]);

   // Save function (centralized) - ensures data for other dates/professors isn't lost
   const saveProfessorAvailability = useCallback((updatedSlots?: BookableSlot[]) => {
        if (typeof window !== 'undefined' && currentUserEmail) {
            // 1. Load the entire availability object
            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, BookableSlot[]> = {};
            if (storedAvailability) {
                try {
                    const parsedAvailability = JSON.parse(storedAvailability);
                     if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
                         allProfessorAvailability = parsedAvailability; // Reset if invalid
                     } else {
                        allProfessorAvailability = {};
                     }
                } catch (e) {
                    console.error("Impossibile analizzare allProfessorAvailability prima del salvataggio", e);
                    allProfessorAvailability = {}; // Reset if parsing fails
                }
            }

            // 2. If specific updated slots are provided (e.g., from daily view toggle or cancellation),
            //    merge them into the existing professor slots. Otherwise, assume the caller
            //    has already modified the full list (less common now).
            if (updatedSlots) {
                let currentProfessorSlots = allProfessorAvailability[currentUserEmail] || [];
                const updatedSlotMap = new Map(updatedSlots.map(slot => [slot.id, slot]));

                // Create a new list by replacing or adding updated slots
                 const newProfessorSlots: BookableSlot[] = [];
                 const processedIds = new Set<string>();

                 // Add all updated slots first
                 updatedSlots.forEach(slot => {
                     if (slot && slot.id) { // Ensure slot and id exist
                         newProfessorSlots.push(slot);
                         processedIds.add(slot.id);
                     } else {
                         console.warn("Tentativo di salvare uno slot non valido o senza ID:", slot);
                     }
                 });

                 // Add existing slots that were NOT updated
                 currentProfessorSlots.forEach(slot => {
                    if (slot && slot.id && !processedIds.has(slot.id)) {
                        newProfessorSlots.push(slot);
                    }
                 });

                 // Filter out any potential null/undefined slots and ensure duration is 60
                 const validatedSlots = newProfessorSlots.filter(slot => slot && slot.date && slot.time && slot.duration === 60);

                 // Sort the combined list
                 allProfessorAvailability[currentUserEmail] = sortSlots(validatedSlots);

            }
            // If no updatedSlots provided, we just save the current state of allProfessorAvailability
            // This path might be less used now as updates should provide the modified slots.

            // 3. Save the entire modified availability object back to localStorage
            localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
        }
   }, [currentUserEmail]);


  const toggleSlotAvailability = (id: string) => {
    // Find the slot to toggle within the current daily view
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedDate) { // Added check for selectedDate
       console.error("Slot non trovato nella vista giornaliera o data non selezionata:", id);
       return;
    }

    // Prevent changing availability if already booked
    if (slotToToggle.bookedBy) {
       toast({
           variant: "destructive",
           title: "Azione Negata",
           description: "Impossibile cambiare la disponibilità di uno slot prenotato. Cancella prima la prenotazione.",
       });
       return;
    }

    // Create the updated slot object
    const updatedSlot = { ...slotToToggle, isAvailable: !slotToToggle.isAvailable };

    // Create the updated list for the current day by replacing the toggled slot
    const updatedDailySlots = dailySlots.map((slot) =>
      slot.id === id ? updatedSlot : slot
    );

    // Update the UI state immediately
    setDailySlots(updatedDailySlots);

    // Persist the change using the centralized save function, passing only the updated slot
    saveProfessorAvailability([updatedSlot]); // Pass only the modified slot

    toast({
        title: updatedSlot.isAvailable ? "Slot Reso Disponibile" : "Slot Reso Non Disponibile",
        description: `Slot alle ${slotToToggle.time} del ${format(selectedDate, 'dd/MM/yyyy')} è ora ${updatedSlot.isAvailable ? 'disponibile per la prenotazione' : 'non disponibile'}.` // Updated message
    })
  };

  // Function to cancel a booking from the professor's side
  const cancelBooking = useCallback((slotId: string) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // 1. Load the entire availability object
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, BookableSlot[]> = {};
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
        let professorSlots = allProfessorAvailability[currentUserEmail];
        if (!professorSlots || !Array.isArray(professorSlots)) {
            toast({ variant: "destructive", title: "Errore Cancellazione", description: "Dati del tuo orario non trovati." });
            return;
        }

        // Find the index of the specific slot to cancel
        const slotIndex = professorSlots.findIndex(s => s && s.id === slotId && s.duration === 60);
        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Errore Cancellazione", description: "Slot non trovato o non valido." });
            loadAndGenerateSlots(); // Refresh list
            return;
        }
        const slotToCancel = professorSlots[slotIndex];
        const studentEmail = slotToCancel.bookedBy; // Get student email before clearing

        // 2. Verify the slot is actually booked
        if (!studentEmail) {
             toast({ variant: "destructive", title: "Errore Cancellazione", description: "Questo slot non è prenotato." });
             return;
        }

        // 3. Update the slot data: remove booking info, set isAvailable to true
        const updatedSlot = {
            ...slotToCancel,
            bookedBy: null,
            bookingTime: null,
            isAvailable: true, // Set to true to make it available again
        };


        // 5. Save updated data back to localStorage using the CENTRALIZED save function
        // Pass the single updated slot to the centralized function for merging
        saveProfessorAvailability([updatedSlot]);

        // 6. Update UI state immediately by reloading slots (both daily and booked)
        loadAndGenerateSlots(); // This re-reads from the updated localStorage

        toast({ title: "Prenotazione Cancellata", description: `Prenotazione per ${studentEmail} il ${format(parseISO(slotToCancel.date), 'dd/MM/yyyy HH:mm')} alle ${slotToCancel.time} cancellata. Lo slot è ora disponibile.` }); // Updated toast message

        // Potential Email Notification to Student (implement sendEmail service if needed)
        // try {
        //    await sendEmail({ to: studentEmail, subject: 'Notifica Cancellazione Lezione', html: `...` });
        // } catch (emailError) {
        //     console.error("Impossibile inviare email di cancellazione allo studente:", emailError);
        // }
    }
  }, [currentUserEmail, loadAndGenerateSlots, saveProfessorAvailability, toast]); // Dependencies


  return (
    <div className="flex flex-col gap-6 p-4 w-full"> {/* Increased gap */}

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Professore</CardTitle>
          <CardDescription>Seleziona una data per gestire i tuoi slot prenotabili da 60 minuti all'interno dei tuoi orari assegnati.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2"> {/* Grid for Calendar + Table */}
          <div className="flex justify-center"> {/* Center Calendar */}
            <Calendar
                locale={it} // Use Italian locale
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                    setSelectedDate(date); // Update selected date
                    // loadAndGenerateSlots will be triggered by useEffect dependency change
                }}
                className="rounded-md border"
                disabled={(date) => isBefore(date, startOfDay(new Date()))} // Disable past dates
            />
          </div>

          <div> {/* Table for the selected date */}
            <h3 className="text-lg font-semibold mb-3">
              Gestisci Slot per {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Nessuna data selezionata'} {/* Format selected date */}
            </h3>
             {dailySlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">
                    {selectedDate ? (isBefore(selectedDate, startOfDay(new Date())) ? "Impossibile gestire slot per date passate." : `Nessuno slot orario da 60 minuti assegnato dall'admin per te il ${daysOfWeek[getDay(selectedDate)]}.`) : 'Seleziona una data per visualizzare gli slot.'}
                 </p>
             ) : (
                 <div className="overflow-x-auto border rounded-md max-h-96"> {/* Add max-height and scroll */}
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead className="w-24">Ora</TableHead>
                         <TableHead className="w-20 text-center">Durata</TableHead>
                         <TableHead>Stato</TableHead>
                         <TableHead className="w-40 text-center">Azioni</TableHead>
                         <TableHead>Info Prenotazione</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {dailySlots.map((slot) => {
                         const isBooked = slot.bookedBy !== null;
                         // Updated status text for clarity
                         const statusText = isBooked ? 'Prenotato' : (slot.isAvailable ? 'Disponibile per Prenotazione' : 'Non Disponibile');
                         const statusColor = isBooked ? 'text-muted-foreground' : (slot.isAvailable ? 'text-green-600' : 'text-red-600'); // Grey for booked

                         return (
                           <TableRow key={slot.id}>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell className="text-center">{slot.duration} min</TableCell>
                             <TableCell className={`${statusColor} font-medium`}>{statusText}</TableCell>
                             <TableCell className="text-center"> {/* Removed space-x-2 */}
                              {isBooked ? (
                                  <Button
                                      variant="ghost" // Display as plain text / ghost button
                                      size="sm"
                                      disabled // Visually disable
                                      className="cursor-not-allowed text-muted-foreground font-normal px-1" // More subtle styling
                                  >
                                      Prenotato
                                  </Button>
                              ) : (
                                  <Button
                                   onClick={() => toggleSlotAvailability(slot.id)}
                                   variant={slot.isAvailable ? 'destructive' : 'default'} // Destructive = "Make Unavailable", Default = "Make Available"
                                   size="sm"
                                   className={cn(
                                      'text-white', // Ensure text color contrasts with background
                                      slot.isAvailable
                                          ? 'bg-red-600 hover:bg-red-700' // Red for "Make Unavailable"
                                          : 'bg-green-600 hover:bg-green-700' // Green for "Make Available"
                                    )}
                                  >
                                    {slot.isAvailable ? 'Rendi Non Disponibile' : 'Rendi Disponibile'}
                                  </Button>
                                )}
                             </TableCell>
                             <TableCell>
                               {slot.bookedBy
                                 ? `Da ${slot.bookedBy}${slot.bookingTime ? ` (${format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm')})` : ''}`
                                 : '—'} {/* Show dash if not booked */}
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

       {/* Professor's Booked Lessons Section */}
        <Card className="w-full">
             <CardHeader>
                 <CardTitle>Tutte le Tue Lezioni Prenotate</CardTitle>
                 <CardDescription>Elenco di tutte le lezioni attualmente prenotate con te. Puoi cancellare le prenotazioni da qui.</CardDescription>
             </CardHeader>
             <CardContent>
                {professorBookedSlots.length === 0 ? (
                     <p className="text-muted-foreground p-4 text-center">Nessuna lezione è attualmente prenotata con te.</p>
                 ) : (
                    <div className="overflow-x-auto border rounded-md max-h-96">
                       <Table>
                         <TableHeader>
                           <TableRow>
                               <TableHead className="w-32">Data</TableHead>
                               <TableHead className="w-24">Ora</TableHead>
                               <TableHead className="w-20 text-center">Durata</TableHead>
                               <TableHead>Prenotato Da</TableHead>
                               <TableHead>Ora Prenotazione</TableHead>
                               <TableHead className="w-40 text-center">Azioni</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                             {professorBookedSlots.map((slot) => {
                                // Defensively check if slot or slot.id exists before rendering row
                                if (!slot || !slot.id) return null;
                                return (
                                     <TableRow key={`booked-prof-${slot.id}`}>
                                         <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy')}</TableCell>
                                         <TableCell>{slot.time}</TableCell>
                                         <TableCell className="text-center">{slot.duration} min</TableCell>
                                         <TableCell>{slot.bookedBy}</TableCell>
                                         <TableCell>{slot.bookingTime ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm') : 'N/A'}</TableCell>
                                         <TableCell className="text-center">
                                             <Button
                                                 onClick={() => cancelBooking(slot.id)}
                                                 variant="destructive"
                                                 size="sm"
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
             </CardContent>
        </Card>
    </div>
  );
}

