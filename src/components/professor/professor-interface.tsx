
'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";

// Define the structure of a bookable slot (30 mins)
interface BookableSlot {
  id: string; // Use 'day-time-professorEmail-part' as a unique identifier (e.g., Monday-8:00-prof@ex.com-0 or -1)
  classroom: string; // Classroom info might not be available in current schedule format
  day: string;
  time: string; // Start time of the 30-min slot (e.g., 8:00, 8:30)
  duration: number; // Always 30 minutes for bookable slots
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student email if booked
  bookingTime: string | null; // Timestamp of booking
  professorEmail: string; // Keep track of the professor
}

// Key for storing all professors' availability preferences in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for admin-defined classroom schedule (hourly)
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

export function ProfessorInterface() {
  const [bookableSlots, setBookableSlots] = useState<BookableSlot[]>([]);
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
             console.error("Logged in user is not a professor.");
             return;
          }
        } catch (e) {
          console.error("Error parsing loggedInUser data:", e);
          return;
        }
      } else {
         console.error("No user logged in.");
         return;
      }

      // 2. Get admin schedule (hourly)
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

      // 3. Get all professors' availability preferences (for 30-min bookable slots)
      const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
      let allProfessorAvailability: Record<string, BookableSlot[]> = {};
      if (storedAvailability) {
        try {
          allProfessorAvailability = JSON.parse(storedAvailability);
        } catch (e) {
          console.error("Failed to parse allProfessorAvailability", e);
          allProfessorAvailability = {};
        }
      }

      // 4. Generate 30-min bookable slots from the professor's assigned hourly slots
      const generatedSlotsMap = new Map<string, BookableSlot>();
      const professorSpecificPreferences = allProfessorAvailability[userEmail] || [];
      const preferenceMap = new Map(professorSpecificPreferences.map(slot => [slot.id, slot]));

      Object.entries(classroomSchedule).forEach(([hourlyKey, assignedEmail]) => {
        if (assignedEmail === userEmail) {
          const [day, hourTime] = hourlyKey.split('-'); // e.g., "Monday", "8:00"
          const hour = parseInt(hourTime.split(':')[0]);

          // Create two 30-min slots for each assigned hour
          const slot1Time = `${String(hour).padStart(2, '0')}:00`;
          const slot2Time = `${String(hour).padStart(2, '0')}:30`;
          const slot1Id = `${day}-${slot1Time}-${userEmail}-0`; // Unique ID for first half
          const slot2Id = `${day}-${slot2Time}-${userEmail}-1`; // Unique ID for second half

          const existingPref1 = preferenceMap.get(slot1Id);
          const existingPref2 = preferenceMap.get(slot2Id);

          generatedSlotsMap.set(slot1Id, {
            id: slot1Id,
            classroom: 'N/A', // Classroom info not in current schedule format
            day: day,
            time: slot1Time,
            duration: 30,
            isAvailable: existingPref1?.isAvailable ?? false,
            bookedBy: existingPref1?.bookedBy ?? null,
            bookingTime: existingPref1?.bookingTime ?? null,
            professorEmail: userEmail,
          });

          generatedSlotsMap.set(slot2Id, {
            id: slot2Id,
            classroom: 'N/A',
            day: day,
            time: slot2Time,
            duration: 30,
            isAvailable: existingPref2?.isAvailable ?? false,
            bookedBy: existingPref2?.bookedBy ?? null,
            bookingTime: existingPref2?.bookingTime ?? null,
            professorEmail: userEmail,
          });
        }
      });

      // 5. Set the state with the generated 30-min bookable slots
      setBookableSlots(Array.from(generatedSlotsMap.values()));
    }
  }, []); // Run only on mount

  // Save availability preferences to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUserEmail && bookableSlots.length > 0) {
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, BookableSlot[]> = {};
         if (storedAvailability) {
             try {
               allProfessorAvailability = JSON.parse(storedAvailability);
             } catch (e) {
                console.error("Failed to parse allProfessorAvailability before saving", e);
                 allProfessorAvailability = {};
             }
         }
         // Update the availability for the current professor
         allProfessorAvailability[currentUserEmail] = bookableSlots;

         // Save the updated object back to localStorage
         localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
    }
    // Only save when currentUserEmail is known and slots are loaded/modified
  }, [bookableSlots, currentUserEmail]);

  const toggleSlotAvailability = (id: string) => {
    setBookableSlots(prevSlots =>
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
    setBookableSlots(prevSlots =>
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


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Manage your bookable 30-minute slots derived from admin assignments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3>Your Bookable Slots</h3>
             {bookableSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4">No slots assigned to you by the admin yet or no slots generated.</p>
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
                       {bookableSlots
                         // Optional: Sort slots for better display
                         .sort((a, b) => {
                           const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                           const dayCompare = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
                           if (dayCompare !== 0) return dayCompare;
                           // Compare time numerically (e.g., 8:00 < 8:30 < 9:00)
                           const timeA = parseFloat(a.time.replace(':', '.'));
                           const timeB = parseFloat(b.time.replace(':', '.'));
                           return timeA - timeB;
                         })
                         .map((slot) => {
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
                                 disabled={isBooked} // Disable toggling if booked
                                 variant={slot.isAvailable ? 'destructive' : 'default'} // Use destructive (red) for Remove, default (greenish?) for Make Available
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
