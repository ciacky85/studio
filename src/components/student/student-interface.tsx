
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns'; // Import date-fns functions

// Define the structure of a slot as seen by the student (matching Professor's BookableSlot)
interface StudentSlotView {
  id: string; // 'YYYY-MM-DD-HH:mm-professorEmail-part' unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time
  duration: number; // 30 min
  professorEmail: string;
  isBookedByCurrentUser: boolean;
  bookingTime: string | null; // ISO string, needed for cancellation check
}

// Key for storing all professors' availability (date-specific slots)
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function StudentInterface() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [availableSlots, setAvailableSlots] = useState<StudentSlotView[]>([]);
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]); // Still show all booked slots regardless of date
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

   // Function to sort slots consistently by date then time
   const sortSlots = (slots: StudentSlotView[]) => {
      return slots.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          const timeA = parseFloat(a.time.replace(':', '.'));
          const timeB = parseFloat(b.time.replace(':', '.'));
          return timeA - timeB;
      });
   };

   // Get current user email on mount
   useEffect(() => {
     if (typeof window !== 'undefined') {
       const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
       if (storedUser) {
         try {
           const userData = JSON.parse(storedUser);
           setCurrentUserEmail(userData.username);
         } catch (e) {
           console.error("Error parsing loggedInUser data:", e);
         }
       } else {
         console.error("No user logged in.");
       }
     }
   }, []);

  // Function to load slots based on selected date and all booked slots for the user
  const loadSlots = useCallback(() => {
     if (typeof window === 'undefined' || !currentUserEmail) {
         setAvailableSlots([]);
         setBookedSlots([]);
         return;
     }

     const formattedSelectedDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;

     // Load all professors' availability
     const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
     let allProfessorAvailability: Record<string, any[]> = {};
     if (storedAvailability) {
         try {
             allProfessorAvailability = JSON.parse(storedAvailability);
         } catch (e) {
             console.error("Failed to parse allProfessorAvailability", e);
             allProfessorAvailability = {};
         }
     }

     const loadedAvailableForDate: StudentSlotView[] = [];
     const loadedBookedByUser: StudentSlotView[] = [];

     Object.values(allProfessorAvailability).flat().forEach(slot => {
         // Basic validation
         if (slot && slot.id && slot.date && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail) {
            const studentViewSlot: StudentSlotView = {
                id: slot.id,
                date: slot.date,
                day: slot.day,
                time: slot.time,
                duration: slot.duration || 30,
                professorEmail: slot.professorEmail,
                isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                bookingTime: slot.bookingTime || null, // Pass booking time
                // classroom: slot.classroom || 'N/A',
            };

             // Add to available list only if it's for the selected date, is available, and not booked
            if (slot.date === formattedSelectedDate && slot.isAvailable && !slot.bookedBy) {
                // Also check if the slot date is not in the past
                const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                if (!isBefore(slotDateTime, startOfDay(new Date()))) {
                     loadedAvailableForDate.push(studentViewSlot);
                }
            }
             // Add to the user's booked list if booked by them, regardless of date
            if (slot.bookedBy === currentUserEmail) {
                loadedBookedByUser.push(studentViewSlot);
            }
         } else {
             // console.warn(`Invalid slot structure found:`, slot);
         }
     });

      // Sort available slots for the selected date
      setAvailableSlots(sortSlots(loadedAvailableForDate));
      // Sort all booked slots for the user
      setBookedSlots(sortSlots(loadedBookedByUser));

  }, [currentUserEmail, selectedDate]); // Rerun when user or date changes

  // Load slots on mount and when dependencies change
  useEffect(() => {
    loadSlots();
  }, [loadSlots]);


  // Function to book a slot
  const bookSlot = useCallback((slotToBook: StudentSlotView) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // 1. Get the latest availability data
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, any[]> = {};
        try {
            allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {};
        } catch (e) {
            console.error("Failed to parse allProfessorAvailability before booking", e);
            toast({ variant: "destructive", title: "Booking Error", description: "Could not load schedule data." });
            return;
        }

        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots || !Array.isArray(professorSlots)) {
             toast({ variant: "destructive", title: "Booking Error", description: "Professor's schedule not found." });
             return;
        }

        const slotIndex = professorSlots.findIndex(s => s.id === slotToBook.id);
        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Booking Error", description: "Slot not found." });
            loadSlots(); // Refresh list
            return;
        }
        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available and not in the past
        const slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
        if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
             toast({ variant: "destructive", title: "Booking Failed", description: "Slot is no longer available or is in the past." });
             loadSlots(); // Refresh the list
             return;
        }

        // 3. Update the slot data
        const now = new Date();
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = now.toISOString(); // Store as ISO string
        originalSlot.isAvailable = false;

        // 4. Save updated data
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots;
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // 5. Update UI state
        loadSlots(); // Reload all slots to reflect the change

        toast({ title: "Booking Successful", description: `Lesson with ${slotToBook.professorEmail} booked for ${format(parseISO(slotToBook.date), 'PPP')} at ${slotToBook.time}.` });

        // TODO: Send email confirmation
        // sendEmail({ to: currentUserEmail, subject: 'Booking Confirmation', ... });
        // sendEmail({ to: slotToBook.professorEmail, subject: 'New Booking', ... });
    }
  }, [currentUserEmail, loadSlots, toast]); // Include loadSlots and toast

  // Function to cancel a booking
  const cancelBooking = useCallback((slotToCancel: StudentSlotView) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
            // 1. Get latest data
            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, any[]> = {};
            try {
                 allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {};
            } catch (e) {
                 console.error("Failed to parse allProfessorAvailability before cancelling", e);
                 toast({ variant: "destructive", title: "Cancellation Error", description: "Could not load schedule data." });
                 return;
            }

           const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots || !Array.isArray(professorSlots)) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Professor's schedule not found." });
                return;
           }

            const slotIndex = professorSlots.findIndex(s => s.id === slotToCancel.id);
            if (slotIndex === -1) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Slot not found." });
                loadSlots(); // Refresh UI
                return;
            }
            const originalSlot = professorSlots[slotIndex];

           // 2. Verify the current user booked this slot
            if (originalSlot.bookedBy !== currentUserEmail) {
                 toast({ variant: "destructive", title: "Cancellation Error", description: "You did not book this slot." });
                 loadSlots();
                 return;
            }

            // --- 24-hour cancellation check ---
            const bookingTime = originalSlot.bookingTime ? parseISO(originalSlot.bookingTime) : null;
            const lessonStartTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
            const now = new Date();

            if (differenceInHours(lessonStartTime, now) < 24) {
                 toast({
                     variant: "destructive",
                     title: "Cancellation Failed",
                     description: "Cannot cancel a lesson less than 24 hours in advance.",
                 });
                 return;
            }
            // --- End 24-hour check ---

           // 3. Update slot data: remove booking, make available
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           originalSlot.isAvailable = true; // Make available again

           // 4. Save updated data
           allProfessorAvailability[slotToCancel.professorEmail] = professorSlots;
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // 5. Update UI state
           loadSlots(); // Reload all slots

           toast({ title: "Booking Cancelled", description: `Your lesson with ${slotToCancel.professorEmail} on ${format(parseISO(slotToCancel.date), 'PPP')} at ${slotToCancel.time} has been cancelled.` });

            // TODO: Send cancellation emails
            // sendEmail({ to: currentUserEmail, subject: 'Cancellation Confirmation', ... });
            // sendEmail({ to: slotToCancel.professorEmail, subject: 'Booking Cancelled', ... });
       }
   }, [currentUserEmail, loadSlots, toast]); // Include loadSlots and toast


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Student Interface</CardTitle>
          <CardDescription>Select a date to view and book available 30-minute lesson slots.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2"> {/* Grid layout */}
            {/* Calendar Selection */}
             <div className="flex justify-center">
               <Calendar
                 mode="single"
                 selected={selectedDate}
                 onSelect={setSelectedDate}
                 className="rounded-md border"
                 disabled={(date) => isBefore(date, startOfDay(new Date()))} // Disable past dates
               />
             </div>

           {/* Available Slots for Selected Date */}
           <div>
             <h3 className="text-lg font-semibold mb-3">
                Available Slots for {selectedDate ? format(selectedDate, 'PPP') : 'No date selected'}
             </h3>
             {availableSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">
                     {selectedDate ? 'No slots available for this date.' : 'Select a date to see available slots.'}
                 </p>
             ) : (
                  <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Time</TableHead>
                          <TableHead>Professor</TableHead>
                          <TableHead className="w-28">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableSlots.map((slot) => (
                          <TableRow key={`available-${slot.id}`}>
                            <TableCell>{slot.time}</TableCell>
                            <TableCell>{slot.professorEmail}</TableCell>
                            <TableCell>
                              <Button onClick={() => bookSlot(slot)} size="sm">Book</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
             )}
           </div>

           {/* Booked Slots (Always Visible) */}
           <div className="md:col-span-2"> {/* Span across both columns on medium screens */}
            <h3 className="text-lg font-semibold mb-3 mt-6">Your Booked Lessons</h3>
            {bookedSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">You haven't booked any lessons yet.</p>
            ) : (
                 <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead className="w-32">Date</TableHead>
                         <TableHead className="w-24">Time</TableHead>
                         <TableHead>Professor</TableHead>
                         <TableHead className="w-40">Actions</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                         {bookedSlots.map((slot) => {
                             const lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                             const canCancel = differenceInHours(lessonDateTime, new Date()) >= 24;

                             return (
                                 <TableRow key={`booked-${slot.id}`}>
                                     <TableCell>{format(parseISO(slot.date), 'PPP')}</TableCell>
                                     <TableCell>{slot.time}</TableCell>
                                     <TableCell>{slot.professorEmail}</TableCell>
                                     <TableCell>
                                         <Button
                                             onClick={() => cancelBooking(slot)}
                                             variant="destructive"
                                             size="sm"
                                             disabled={!canCancel}
                                             title={!canCancel ? "Cannot cancel less than 24 hours before" : "Cancel this booking"}
                                         >
                                             Cancel Booking
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

    