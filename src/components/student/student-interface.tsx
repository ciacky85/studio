
'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";

// Define the structure of a slot as seen by the student (matches BookableSlot)
interface StudentSlotView {
  id: string; // 'day-time-professorEmail-part' unique ID
  classroom: string; // May be N/A
  day: string;
  time: string; // Start time of the 30-min slot
  duration: number; // Should be 30 min
  professorEmail: string; // Identify the professor
  isBookedByCurrentUser: boolean; // Track if this student booked this slot
  // No bookingTime needed for student view generally, unless showing their own bookings' details
}

// Key for storing all professors' availability preferences (BookableSlot[]) in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function StudentInterface() {
  const [availableSlots, setAvailableSlots] = useState<StudentSlotView[]>([]);
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

   // Function to sort slots consistently
   const sortSlots = (slots: StudentSlotView[]) => {
      return slots.sort((a, b) => {
          const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
          const dayCompare = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
          if (dayCompare !== 0) return dayCompare;
          const timeA = parseFloat(a.time.replace(':', '.'));
          const timeB = parseFloat(b.time.replace(':', '.'));
          return timeA - timeB;
      });
   };


  // Function to load slots from storage
  const loadSlots = () => {
     if (typeof window !== 'undefined') {
        // 1. Get logged-in user email
        const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
        let userEmail: string | null = null;
        if (storedUser) {
            try {
            const userData = JSON.parse(storedUser);
            userEmail = userData.username; // Assume role check happened at login/routing
            setCurrentUserEmail(userEmail);
            } catch (e) {
            console.error("Error parsing loggedInUser data:", e);
            return;
            }
        } else {
            console.error("No user logged in.");
            return;
        }

        // 2. Get all professors' availability preferences (BookableSlot[])
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, any[]> = {}; // Use 'any' temporarily
        if (storedAvailability) {
            try {
            allProfessorAvailability = JSON.parse(storedAvailability);
            } catch (e) {
            console.error("Failed to parse allProfessorAvailability", e);
            allProfessorAvailability = {};
            }
        }

        // 3. Process slots
        const loadedAvailable: StudentSlotView[] = [];
        const loadedBooked: StudentSlotView[] = [];

        Object.entries(allProfessorAvailability).forEach(([professorEmail, professorSlots]) => {
            if (Array.isArray(professorSlots)) {
            professorSlots.forEach(slot => {
                // Validate essential properties of a BookableSlot
                if (slot && slot.id && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail) {
                    const studentViewSlot: StudentSlotView = {
                        id: slot.id, // Use the existing unique ID
                        classroom: slot.classroom || 'N/A',
                        day: slot.day,
                        time: slot.time,
                        duration: slot.duration || 30, // Default to 30 if missing
                        professorEmail: slot.professorEmail,
                        isBookedByCurrentUser: slot.bookedBy === userEmail,
                    };

                    if (slot.isAvailable && !slot.bookedBy) {
                        loadedAvailable.push(studentViewSlot);
                    } else if (slot.bookedBy === userEmail) {
                        loadedBooked.push(studentViewSlot);
                    }
                } else {
                    console.warn(`Invalid slot structure found for professor ${professorEmail}:`, slot);
                }
            });
            } else {
            console.warn(`Invalid data structure for professor ${professorEmail} in allProfessorAvailability.`);
            }
        });

         // Sort available slots for display
         setAvailableSlots(sortSlots(loadedAvailable));
         // Sort booked slots for display
         setBookedSlots(sortSlots(loadedBooked));

     }
  };

  // Load slots on mount
  useEffect(() => {
    loadSlots();
  }, []); // Run only on mount

  // Function to book a slot
  const bookSlot = (slotToBook: StudentSlotView) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // 1. Get the latest availability data
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, any[]> = {};
        if (storedAvailability) {
            try {
                allProfessorAvailability = JSON.parse(storedAvailability);
            } catch (e) {
                console.error("Failed to parse allProfessorAvailability before booking", e);
                toast({ variant: "destructive", title: "Booking Error", description: "Could not load schedule data." });
                return;
            }
        }

        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots || !Array.isArray(professorSlots)) {
             toast({ variant: "destructive", title: "Booking Error", description: "Professor's schedule not found." });
             return;
        }

        // Find the specific slot using the unique ID
        const slotIndex = professorSlots.findIndex(s => s.id === slotToBook.id);

        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Booking Error", description: "Slot not found." });
            loadSlots(); // Refresh list as slot might have been booked/removed
            return;
        }

        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available (atomic check simulation)
        if (!originalSlot.isAvailable || originalSlot.bookedBy) {
             toast({ variant: "destructive", title: "Booking Failed", description: "Slot is no longer available." });
             loadSlots(); // Refresh the list to show the updated status
             return;
        }

        // 3. Update the slot data
        const now = new Date();
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = now.toLocaleString(); // Consider using ISO string new Date().toISOString()
        originalSlot.isAvailable = false; // Mark as booked

        // 4. Save the updated data back to localStorage
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots;
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // 5. Update UI state immediately for responsiveness
        setBookedSlots(prev => sortSlots([...prev, {...slotToBook, isBookedByCurrentUser: true}]));
        setAvailableSlots(prev => prev.filter(s => s.id !== slotToBook.id)); // Already sorted

        toast({ title: "Booking Successful", description: `Lesson with ${slotToBook.professorEmail} booked for ${slotToBook.day} at ${slotToBook.time}.` });

        // Consider sending email confirmation here
        // sendEmail({ to: currentUserEmail, subject: 'Booking Confirmation', ... });
        // sendEmail({ to: slotToBook.professorEmail, subject: 'New Booking', ... });
    }
  };

  // Function to cancel a booking
  const cancelBooking = (slotToCancel: StudentSlotView) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
           // 1. Get latest data
           const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
           let allProfessorAvailability: Record<string, any[]> = {};
            if (storedAvailability) {
                try {
                    allProfessorAvailability = JSON.parse(storedAvailability);
                } catch (e) {
                    console.error("Failed to parse allProfessorAvailability before cancelling", e);
                    toast({ variant: "destructive", title: "Cancellation Error", description: "Could not load schedule data." });
                    return;
                }
            } else {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Schedule data not found." });
                return;
            }

           const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots || !Array.isArray(professorSlots)) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Professor's schedule not found." });
                return;
           }

            // Find the slot by ID
            const slotIndex = professorSlots.findIndex(s => s.id === slotToCancel.id);

            if (slotIndex === -1) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Slot not found in professor's schedule." });
                loadSlots(); // Refresh UI
                return;
            }

            const originalSlot = professorSlots[slotIndex];

           // 2. Verify the current user booked this slot
            if (originalSlot.bookedBy !== currentUserEmail) {
                 toast({ variant: "destructive", title: "Cancellation Error", description: "You did not book this slot." });
                 loadSlots(); // Refresh UI as state might be inconsistent
                 return;
            }

            // --- Add 24-hour cancellation check ---
            // This requires storing bookingTime as an ISO string ideally and robust date calculation
            // Placeholder for future implementation
            // --- End 24-hour check ---


           // 3. Update the slot data to remove booking info AND make it available again
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           originalSlot.isAvailable = true; // Make the slot available again upon cancellation

           // 4. Save updated data
           allProfessorAvailability[slotToCancel.professorEmail] = professorSlots;
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // 5. Update UI state immediately
           // Remove from booked list
           setBookedSlots(prev => prev.filter(s => s.id !== slotToCancel.id)); // Already sorted
           // Add back to available list
           setAvailableSlots(prev => sortSlots([...prev, {...slotToCancel, isBookedByCurrentUser: false}]));


           toast({ title: "Booking Cancelled", description: `Your lesson with ${slotToCancel.professorEmail} on ${slotToCancel.day} at ${slotToCancel.time} has been cancelled.` });

            // Consider sending cancellation emails here
            // sendEmail({ to: currentUserEmail, subject: 'Cancellation Confirmation', ... });
            // sendEmail({ to: slotToCancel.professorEmail, subject: 'Booking Cancelled', ... });
       }
   };


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Student Interface</CardTitle>
          <CardDescription>View and book available 30-minute lesson slots.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6"> {/* Increased gap */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Available Slots</h3>
            {availableSlots.length === 0 ? (
                <p className="text-muted-foreground p-4">No lesson slots currently available for booking.</p>
            ) : (
                 <div className="overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         {/* <TableHead>Classroom</TableHead> */}
                         <TableHead>Day</TableHead>
                         <TableHead>Time</TableHead>
                         <TableHead>Duration</TableHead>
                         <TableHead>Professor</TableHead>
                         <TableHead>Actions</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {availableSlots.map((slot) => (
                         <TableRow key={`available-${slot.id}`}> {/* Ensure unique key */}
                           {/* <TableCell>{slot.classroom}</TableCell> */}
                           <TableCell>{slot.day}</TableCell>
                           <TableCell>{slot.time}</TableCell>
                           <TableCell>{slot.duration} min</TableCell>
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

          <div>
            <h3 className="text-lg font-semibold mb-3">Your Booked Slots</h3>
            {bookedSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4">You haven't booked any lessons yet.</p>
            ) : (
                 <div className="overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         {/* <TableHead>Classroom</TableHead> */}
                         <TableHead>Day</TableHead>
                         <TableHead>Time</TableHead>
                         <TableHead>Duration</TableHead>
                         <TableHead>Professor</TableHead>
                         <TableHead>Actions</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                         {bookedSlots.map((slot) => (
                            <TableRow key={`booked-${slot.id}`}> {/* Ensure unique key */}
                                {/* <TableCell>{slot.classroom}</TableCell> */}
                                <TableCell>{slot.day}</TableCell>
                                <TableCell>{slot.time}</TableCell>
                                <TableCell>{slot.duration} min</TableCell>
                                <TableCell>{slot.professorEmail}</TableCell>
                                <TableCell>
                                    {/* Add check for cancellation window here if implementing */}
                                    <Button onClick={() => cancelBooking(slot)} variant="destructive" size="sm">Cancel Booking</Button>
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
    </div>
  );
}
