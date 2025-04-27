
'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";

// Define the structure of a slot as seen by the student
interface StudentSlotView {
  id: string; // 'day-time-professorEmail' unique ID
  classroom: string; // May be N/A
  day: string;
  time: string;
  duration: number;
  professorEmail: string; // Identify the professor
  isBookedByCurrentUser: boolean; // Track if this student booked this slot
}

// Key for storing all professors' availability preferences in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function StudentInterface() {
  const [availableSlots, setAvailableSlots] = useState<StudentSlotView[]>([]);
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

  // Load available and booked slots on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Get logged-in user email
      const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
      let userEmail: string | null = null;
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
           // Allow any role for now, but ideally check for 'student'
           userEmail = userData.username;
           setCurrentUserEmail(userEmail);
        } catch (e) {
          console.error("Error parsing loggedInUser data:", e);
          return; // Handle error appropriately
        }
      } else {
        console.error("No user logged in.");
        return; // Handle error appropriately
      }

      // 2. Get all professors' availability preferences
      const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
      let allProfessorAvailability: Record<string, any[]> = {}; // Use 'any' temporarily for flexibility
      if (storedAvailability) {
        try {
          allProfessorAvailability = JSON.parse(storedAvailability);
        } catch (e) {
          console.error("Failed to parse allProfessorAvailability", e);
          allProfessorAvailability = {};
        }
      }

      // 3. Process slots to show available and booked by current user
      const loadedAvailable: StudentSlotView[] = [];
      const loadedBooked: StudentSlotView[] = [];

      Object.entries(allProfessorAvailability).forEach(([professorEmail, professorSlots]) => {
        if (Array.isArray(professorSlots)) {
           professorSlots.forEach(slot => {
             // Basic validation of slot structure
             if (slot && slot.id && slot.day && slot.time && typeof slot.isAvailable === 'boolean') {
                const studentViewSlot: StudentSlotView = {
                    id: `${slot.id}-${professorEmail}`, // Create a unique ID including professor
                    classroom: slot.classroom || 'N/A',
                    day: slot.day,
                    time: slot.time,
                    duration: slot.duration || 30,
                    professorEmail: professorEmail,
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

      setAvailableSlots(loadedAvailable);
      setBookedSlots(loadedBooked);
    }
  }, []); // Run only on mount

  // Function to book a slot
  const bookSlot = (slotToBook: StudentSlotView) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        // 1. Find the original slot data in allProfessorAvailability
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

        const slotIndex = professorSlots.findIndex(s => `${s.id}-${slotToBook.professorEmail}` === slotToBook.id);

        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Booking Error", description: "Slot not found." });
            return;
        }

        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available
        if (!originalSlot.isAvailable || originalSlot.bookedBy) {
             toast({ variant: "destructive", title: "Booking Failed", description: "Slot is no longer available." });
             // Re-sync UI if needed (optional, depends on desired behavior)
             // You might want to reload the slots here to reflect the latest state
             setAvailableSlots(prev => prev.filter(s => s.id !== slotToBook.id));
             return;
        }

        // 3. Update the slot data
        const now = new Date();
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = now.toLocaleString();
        originalSlot.isAvailable = false; // Mark as booked

        // 4. Save the updated data back to localStorage
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots;
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // 5. Update UI state
        setBookedSlots(prev => [...prev, {...slotToBook, isBookedByCurrentUser: true}]);
        setAvailableSlots(prev => prev.filter(s => s.id !== slotToBook.id));

        toast({ title: "Booking Successful", description: `Lesson with ${slotToBook.professorEmail} booked for ${slotToBook.day} at ${slotToBook.time}.` });
    }
  };

  // Function to cancel a booking (Optional)
  const cancelBooking = (slotToCancel: StudentSlotView) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
           // Similar logic to bookSlot, but find the slot in bookedSlots and revert changes in localStorage
           const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
           let allProfessorAvailability: Record<string, any[]> = {};
           // ... (parse localStorage, handle errors) ...
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

            const slotIndex = professorSlots.findIndex(s => `${s.id}-${slotToCancel.professorEmail}` === slotToCancel.id);

            if (slotIndex === -1) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Slot not found in professor's schedule." });
                return;
            }

            const originalSlot = professorSlots[slotIndex];

           // Check if the current user actually booked this slot
            if (originalSlot.bookedBy !== currentUserEmail) {
                 toast({ variant: "destructive", title: "Cancellation Error", description: "You did not book this slot." });
                 return;
            }

           // Update the slot data to make it available again (professor needs to re-enable if needed)
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           // Professor controls `isAvailable`, so we don't set it back to true here.
           // originalSlot.isAvailable = true; // Let professor control this

           // Save updated data
           allProfessorAvailability[slotToCancel.professorEmail] = professorSlots;
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // Update UI state
           setBookedSlots(prev => prev.filter(s => s.id !== slotToCancel.id));
           // Add the slot back to available *only if the professor still has it marked as available*
           // This requires re-fetching or more complex state management. For simplicity, we won't add it back here.
           // A refresh or re-fetch mechanism would be better.

           toast({ title: "Booking Cancelled", description: `Your lesson with ${slotToCancel.professorEmail} on ${slotToCancel.day} at ${slotToCancel.time} has been cancelled.` });
       }
   };


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Student Interface</CardTitle>
          <CardDescription>View and book available lesson slots.</CardDescription>
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
                         <TableRow key={slot.id}>
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
                            <TableRow key={slot.id}>
                                {/* <TableCell>{slot.classroom}</TableCell> */}
                                <TableCell>{slot.day}</TableCell>
                                <TableCell>{slot.time}</TableCell>
                                <TableCell>{slot.duration} min</TableCell>
                                <TableCell>{slot.professorEmail}</TableCell>
                                <TableCell>
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

    