
'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";

// Define the structure of a slot
interface Slot {
  id: string; // Use 'day-time' as a unique identifier
  classroom: string; // Classroom info might not be available in current schedule format
  day: string;
  time: string;
  duration: number; // Assuming 30 mins based on admin grid
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student email if booked
  bookingTime: string | null; // Timestamp of booking
}

// Key for storing all professors' availability preferences in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for admin-defined classroom schedule
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function ProfessorInterface() {
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

  // Load assigned slots and availability preferences on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Get logged-in user email
      const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
      let userEmail: string | null = null;
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.role === 'professor') {
            userEmail = userData.username;
            setCurrentUserEmail(userEmail);
          } else {
             // Should not happen if routing is correct, but handle defensively
             console.error("Logged in user is not a professor.");
             return;
          }
        } catch (e) {
          console.error("Error parsing loggedInUser data:", e);
          // Redirect to login or handle error appropriately
          return;
        }
      } else {
         // Not logged in, redirect or handle error
         console.error("No user logged in.");
         // router.push('/'); // Example redirect
         return;
      }

      // 2. Get admin schedule
      const storedSchedule = localStorage.getItem(CLASSROOM_SCHEDULE_KEY);
      let classroomSchedule: Record<string, string> = {};
      if (storedSchedule) {
        try {
          classroomSchedule = JSON.parse(storedSchedule);
        } catch (e) {
          console.error("Failed to parse classroomSchedule", e);
          classroomSchedule = {};
        }
      }

      // 3. Get all professors' availability preferences
      const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
      let allProfessorAvailability: Record<string, Slot[]> = {};
      if (storedAvailability) {
        try {
          allProfessorAvailability = JSON.parse(storedAvailability);
        } catch (e) {
          console.error("Failed to parse allProfessorAvailability", e);
          allProfessorAvailability = {};
        }
      }

      // 4. Filter schedule for the current professor
      const assignedSlotsMap = new Map<string, Slot>();
      const professorSpecificAvailability = allProfessorAvailability[userEmail] || [];
      const professorAvailabilityMap = new Map(professorSpecificAvailability.map(slot => [slot.id, slot]));


      Object.entries(classroomSchedule).forEach(([key, assignedEmail]) => {
        if (assignedEmail === userEmail) {
          const [day, time] = key.split('-');
          const existingPreference = professorAvailabilityMap.get(key);

          assignedSlotsMap.set(key, {
            id: key,
            classroom: 'N/A', // Classroom info not in current schedule format
            day: day,
            time: time,
            duration: 30, // Assuming 30 min slots from admin grid
            isAvailable: existingPreference?.isAvailable ?? false, // Default to not available if new
            bookedBy: existingPreference?.bookedBy ?? null,
            bookingTime: existingPreference?.bookingTime ?? null,
          });
        }
      });

      // 5. Set the state with the reconciled slots
      setAvailableSlots(Array.from(assignedSlotsMap.values()));
    }
  }, []); // Run only on mount

  // Save availability preferences to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserEmail && availableSlots.length > 0) {
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, Slot[]> = {};
         if (storedAvailability) {
             try {
               allProfessorAvailability = JSON.parse(storedAvailability);
             } catch (e) {
                console.error("Failed to parse allProfessorAvailability before saving", e);
                 allProfessorAvailability = {};
             }
         }
         // Update the availability for the current professor
         allProfessorAvailability[currentUserEmail] = availableSlots;

         // Save the updated object back to localStorage
         localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
    }
    // Only save when currentUserEmail is known and slots are loaded/modified
  }, [availableSlots, currentUserEmail]);

  const toggleSlotAvailability = (id: string) => {
    setAvailableSlots(prevSlots =>
      prevSlots.map((slot) =>
        slot.id === id ? {...slot, isAvailable: !slot.isAvailable} : slot
      )
    );
    // The useEffect hook above will handle saving to localStorage
  };

  // Function to simulate booking a slot by a student (for testing display)
  // In a real app, this would be triggered by the student interface and update localStorage
  const bookSlot = (id: string, studentName: string) => {
    const now = new Date();
    setAvailableSlots(prevSlots =>
      prevSlots.map((slot) =>
        slot.id === id
          ? {
              ...slot,
              bookedBy: studentName,
              bookingTime: now.toLocaleString(),
              isAvailable: false, // Mark as not available when booked
            }
          : slot
      )
    );
     toast({ title: "Slot Booked", description: `Slot ${id} booked by ${studentName}.` });
      // The useEffect hook above will handle saving to localStorage
  };


  // Example: Simulate a student booking the first available slot after 5 seconds
  // useEffect(() => {
  //   if (availableSlots.length > 0) {
  //       const firstSlotId = availableSlots[0].id;
  //       const timer = setTimeout(() => {
  //           // Find the current state of the first slot before booking
  //           const slotToBook = availableSlots.find(s => s.id === firstSlotId);
  //           if (slotToBook && slotToBook.isAvailable && !slotToBook.bookedBy) { // Only book if available
  //                bookSlot(firstSlotId, 'Alice (Test)');
  //           }
  //       }, 5000);
  //       return () => clearTimeout(timer); // Cleanup timer on component unmount
  //   }
  // }, [availableSlots]); // Re-run if availableSlots changes


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Manage your assigned slots and make them available for booking.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3>Your Assigned Slots</h3>
             {availableSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4">No slots assigned to you by the admin yet.</p>
             ) : (
                 <div className="overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Day</TableHead>
                         <TableHead>Time</TableHead>
                         <TableHead>Duration</TableHead>
                         {/* <TableHead>Classroom</TableHead> */}
                         <TableHead>Status</TableHead>
                         <TableHead>Actions</TableHead>
                         <TableHead>Booking Info</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {availableSlots.map((slot) => {
                         const isBooked = slot.bookedBy !== null;
                         const statusText = isBooked ? 'Booked' : (slot.isAvailable ? 'Available for Booking' : 'Not Available');
                         return (
                           <TableRow key={slot.id}>
                             <TableCell>{slot.day}</TableCell>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell>{slot.duration} min</TableCell>
                             {/* <TableCell>{slot.classroom}</TableCell> */}
                             <TableCell>{statusText}</TableCell>
                             <TableCell>
                               <Button
                                 onClick={() => toggleSlotAvailability(slot.id)}
                                 // className={slot.isAvailable ? 'bg-red-500 hover:bg-red-700 text-white' : 'bg-green-500 hover:bg-green-700 text-white'}
                                 disabled={isBooked} // Disable toggling if booked
                                 variant={slot.isAvailable ? 'destructive' : 'default'} // Use destructive (red) for Remove, default (theme primary) for Make Available
                                 size="sm"
                               >
                                 {slot.isAvailable ? 'Remove' : 'Make Available'}
                               </Button>
                             </TableCell>
                             <TableCell>
                               {slot.bookedBy ? `Booked by ${slot.bookedBy} on ${slot.bookingTime}` : 'Not Booked'}
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

    