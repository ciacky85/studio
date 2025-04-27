
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO } from 'date-fns'; // Import date-fns functions

// Define the structure of a bookable slot (30 mins) with date
interface BookableSlot {
  id: string; // Use 'YYYY-MM-DD-HH:mm-professorEmail-part' as a unique identifier
  date: string; // 'YYYY-MM-DD' format
  day: string; // Day of the week (e.g., 'Monday')
  time: string; // Start time of the 30-min slot (e.g., 8:00, 8:30)
  duration: number; // Always 30 minutes
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student email if booked
  bookingTime: string | null; // ISO string timestamp of booking
  professorEmail: string; // Keep track of the professor
  // classroom: string; // Classroom info might not be available in current schedule format
}

// Key for storing all professors' availability (now date-specific slots) in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for admin-defined classroom schedule (hourly template)
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // Match getDay() output

export function ProfessorInterface() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()); // Default to today
  const [dailySlots, setDailySlots] = useState<BookableSlot[]>([]);
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
            console.error("Logged in user is not a professor.");
          }
        } catch (e) {
          console.error("Error parsing loggedInUser data:", e);
        }
      } else {
         console.error("No user logged in.");
      }
    }
  }, []);

  // Load/Generate slots when selectedDate or currentUserEmail changes
  const loadAndGenerateSlots = useCallback(() => {
    if (typeof window === 'undefined' || !selectedDate || !currentUserEmail) {
      setDailySlots([]); // Clear slots if no date/user
      return;
    }

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = getDay(selectedDate); // 0 for Sunday, 1 for Monday, etc.
    const dayOfWeekString = daysOfWeek[dayIndex];

    // 1. Load admin's hourly schedule template
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

    // 2. Load all existing bookable slots (across all dates/professors)
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

    // 3. Get existing slots for the current professor for the selected date
    const professorExistingSlots = allProfessorAvailability[currentUserEmail] || [];
    const existingSlotsForDateMap = new Map<string, BookableSlot>(
      professorExistingSlots
        .filter(slot => slot.date === formattedDate)
        .map(slot => [slot.id, slot])
    );

    // 4. Generate potential slots based on admin schedule for the specific day of the week
    const generatedSlots: BookableSlot[] = [];
    Object.entries(classroomSchedule).forEach(([hourlyKey, assignedEmail]) => {
      const [day, hourTime] = hourlyKey.split('-'); // e.g., "Monday", "08:00"

      // Check if the slot is for the selected day of the week and assigned to the current professor
      if (day === dayOfWeekString && assignedEmail === currentUserEmail) {
        const hour = parseInt(hourTime.split(':')[0]);

        // Create two 30-min potential slots
        const slot1Time = `${String(hour).padStart(2, '0')}:00`;
        const slot2Time = `${String(hour).padStart(2, '0')}:30`;
        const slot1Id = `${formattedDate}-${slot1Time}-${currentUserEmail}-0`;
        const slot2Id = `${formattedDate}-${slot2Time}-${currentUserEmail}-1`;

        const existingSlot1 = existingSlotsForDateMap.get(slot1Id);
        const existingSlot2 = existingSlotsForDateMap.get(slot2Id);

        generatedSlots.push({
          id: slot1Id,
          date: formattedDate,
          day: dayOfWeekString,
          time: slot1Time,
          duration: 30,
          isAvailable: existingSlot1?.isAvailable ?? false,
          bookedBy: existingSlot1?.bookedBy ?? null,
          bookingTime: existingSlot1?.bookingTime ?? null,
          professorEmail: currentUserEmail,
        });

        generatedSlots.push({
          id: slot2Id,
          date: formattedDate,
          day: dayOfWeekString,
          time: slot2Time,
          duration: 30,
          isAvailable: existingSlot2?.isAvailable ?? false,
          bookedBy: existingSlot2?.bookedBy ?? null,
          bookingTime: existingSlot2?.bookingTime ?? null,
          professorEmail: currentUserEmail,
        });
      }
    });

    // Sort generated slots by time
     generatedSlots.sort((a, b) => {
       const timeA = parseFloat(a.time.replace(':', '.'));
       const timeB = parseFloat(b.time.replace(':', '.'));
       return timeA - timeB;
     });


    setDailySlots(generatedSlots);

  }, [selectedDate, currentUserEmail]); // Rerun when date or user changes

  // Trigger slot loading/generation
  useEffect(() => {
    loadAndGenerateSlots();
  }, [loadAndGenerateSlots]);

   // Save function (centralized)
   const saveProfessorAvailability = useCallback((updatedSlots: BookableSlot[]) => {
        if (typeof window !== 'undefined' && currentUserEmail) {
            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, BookableSlot[]> = {};
            if (storedAvailability) {
                try {
                    allProfessorAvailability = JSON.parse(storedAvailability);
                } catch (e) {
                    console.error("Failed to parse allProfessorAvailability before saving", e);
                    allProfessorAvailability = {}; // Reset if parsing fails
                }
            }

            // Get existing slots for the professor, excluding the currently selected date
            const otherDateSlots = (allProfessorAvailability[currentUserEmail] || [])
                .filter(slot => slot.date !== format(selectedDate!, 'yyyy-MM-dd'));

            // Combine other date slots with the updated slots for the selected date
            allProfessorAvailability[currentUserEmail] = [...otherDateSlots, ...updatedSlots];

            // Save back to localStorage
            localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
        }
   }, [currentUserEmail, selectedDate]);


  const toggleSlotAvailability = (id: string) => {
    const updatedDailySlots = dailySlots.map((slot) =>
      slot.id === id ? {...slot, isAvailable: !slot.isAvailable} : slot
    );
    setDailySlots(updatedDailySlots); // Update UI immediately
    saveProfessorAvailability(updatedDailySlots); // Persist the change for the current date
  };

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Select a date to manage your bookable 30-minute slots.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2"> {/* Grid for Calendar + Table */}
          <div className="flex justify-center"> {/* Center Calendar */}
            <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
            />
          </div>

          <div> {/* Table for the selected date */}
            <h3 className="text-lg font-semibold mb-3">
              Slots for {selectedDate ? format(selectedDate, 'PPP') : 'No date selected'} {/* Format selected date */}
            </h3>
             {dailySlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">
                    {selectedDate ? `No available time slots assigned by admin for ${daysOfWeek[getDay(selectedDate)]}s.` : 'Select a date to view slots.'}
                 </p>
             ) : (
                 <div className="overflow-x-auto border rounded-md">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead className="w-24">Time</TableHead>
                         <TableHead className="w-20">Duration</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead className="w-40">Actions</TableHead>
                         <TableHead>Booking Info</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {dailySlots.map((slot) => {
                         const isBooked = slot.bookedBy !== null;
                         const statusText = isBooked ? 'Booked' : (slot.isAvailable ? 'Available' : 'Not Available');
                         return (
                           <TableRow key={slot.id}>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell>{slot.duration} min</TableCell>
                             <TableCell>{statusText}</TableCell>
                             <TableCell>
                               <Button
                                 onClick={() => toggleSlotAvailability(slot.id)}
                                 disabled={isBooked} // Disable toggling if booked
                                 variant={slot.isAvailable ? 'destructive' : 'default'}
                                 size="sm"
                                 className={slot.isAvailable ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} // Explicit colors
                               >
                                 {slot.isAvailable ? 'Remove' : 'Make Available'}
                               </Button>
                             </TableCell>
                             <TableCell>
                               {slot.bookedBy
                                 ? `By ${slot.bookedBy} (${slot.bookingTime ? format(parseISO(slot.bookingTime), 'Pp') : 'N/A'})`
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
    </div>
  );
}

    