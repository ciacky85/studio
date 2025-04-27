
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore } from 'date-fns'; // Import date-fns functions

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
            // Optionally redirect or show error message
            // router.push('/'); // Example redirect
          }
        } catch (e) {
          console.error("Error parsing loggedInUser data:", e);
        }
      } else {
         console.error("No user logged in.");
         // Optionally redirect or show error message
         // router.push('/'); // Example redirect
      }
    }
  }, []);

  // Load/Generate slots when selectedDate or currentUserEmail changes
  const loadAndGenerateSlots = useCallback(() => {
    if (typeof window === 'undefined' || !selectedDate || !currentUserEmail) {
      setDailySlots([]); // Clear slots if no date/user or on server
      return;
    }

    // Ensure selected date is not in the past for generating slots
    if (isBefore(selectedDate, startOfDay(new Date()))) {
       // Don't generate slots for past dates, maybe show message?
       setDailySlots([]);
       // Optionally inform the user:
       // toast({ title: "Cannot manage slots for past dates.", variant: "destructive" });
       return;
    }


    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = getDay(selectedDate); // 0 for Sunday, 1 for Monday, etc.
    const dayOfWeekString = daysOfWeek[dayIndex];

    // 1. Load admin's hourly schedule template
    const storedSchedule = localStorage.getItem(CLASSROOM_SCHEDULE_KEY);
    let classroomSchedule: Record<string, string> = {}; // Key: "Day-HH:00", Value: Professor Email
    if (storedSchedule) {
      try {
        classroomSchedule = JSON.parse(storedSchedule);
         if (typeof classroomSchedule !== 'object' || classroomSchedule === null) {
            console.warn("Invalid classroom schedule format found in localStorage.");
            classroomSchedule = {}; // Reset if invalid
         }
      } catch (e) {
        console.error("Failed to parse classroomSchedule", e);
        classroomSchedule = {};
      }
    }

    // 2. Load all existing bookable slots (across all dates/professors) to get saved state
    const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
    let allProfessorAvailability: Record<string, BookableSlot[]> = {}; // Key: professorEmail
    if (storedAvailability) {
      try {
        allProfessorAvailability = JSON.parse(storedAvailability);
         if (typeof allProfessorAvailability !== 'object' || allProfessorAvailability === null) {
             console.warn("Invalid allProfessorAvailability format found in localStorage.");
             allProfessorAvailability = {}; // Reset if invalid
         }
      } catch (e) {
        console.error("Failed to parse allProfessorAvailability", e);
        allProfessorAvailability = {};
      }
    }

    // 3. Get existing slots specific to the current professor and selected date for quick lookup
    const professorExistingSlotsMap = new Map<string, BookableSlot>(
      (allProfessorAvailability[currentUserEmail] || [])
        .filter(slot => slot && slot.date === formattedDate && slot.duration === 60) // Added check for slot existence
        .map(slot => [slot.id, slot])
    );

    // 4. Generate potential 60-minute slots based ONLY on admin schedule assignments for this professor on the selected day
    const generatedSlots: BookableSlot[] = [];

    Object.entries(classroomSchedule).forEach(([hourlyKey, assignedEmail]) => {
      const [day, hourTime] = hourlyKey.split('-'); // e.g., "Monday", "08:00"

      // Check if the admin slot is for the selected day of the week AND assigned to the current professor
      if (day === dayOfWeekString && assignedEmail === currentUserEmail && hourTime.endsWith(':00')) {
        // Ensure we only process hourly slots from admin schedule
        const slotId = `${formattedDate}-${hourTime}-${currentUserEmail}`;

        // Retrieve existing saved data (isAvailable, bookedBy) for this specific slot ID if it exists
        const existingSlotData = professorExistingSlotsMap.get(slotId);

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
    });

    // Sort the generated slots by time
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
   const saveProfessorAvailability = useCallback((updatedSlotsForSelectedDate: BookableSlot[]) => {
        if (typeof window !== 'undefined' && currentUserEmail && selectedDate) {
            const currentFormattedDate = format(selectedDate, 'yyyy-MM-dd');

            // 1. Load the entire availability object
            const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
            let allProfessorAvailability: Record<string, BookableSlot[]> = {};
            if (storedAvailability) {
                try {
                    allProfessorAvailability = JSON.parse(storedAvailability);
                     if (typeof allProfessorAvailability !== 'object' || allProfessorAvailability === null) {
                         allProfessorAvailability = {}; // Reset if invalid
                     }
                } catch (e) {
                    console.error("Failed to parse allProfessorAvailability before saving", e);
                    allProfessorAvailability = {}; // Reset if parsing fails
                }
            }

            // 2. Get existing slots for the current professor, filtering out invalid ones and excluding the selected date
            const otherDateSlots = (allProfessorAvailability[currentUserEmail] || [])
                .filter(slot => slot && slot.date && slot.time && slot.date !== currentFormattedDate); // Added validation check

            // 3. Combine the other date slots with the UPDATED slots for the selected date
            // Ensure all slots in the updated list have duration 60, just in case
            const validatedUpdatedSlots = updatedSlotsForSelectedDate
                .filter(slot => slot && slot.date && slot.time) // Filter invalid slots from update list too
                .map(slot => ({...slot, duration: 60}));
            const combinedSlots = [...otherDateSlots, ...validatedUpdatedSlots];

            // Sort combined slots before saving (optional but good practice)
            combinedSlots.sort((a, b) => {
               // Defensive checks for missing properties
               if (!a || !b || !a.date || !b.date || !a.time || !b.time) {
                    console.warn('Attempted to sort invalid slot data:', a, b);
                    return 0; // Avoid erroring, maintain relative order
               }
               const dateCompare = a.date.localeCompare(b.date);
               if (dateCompare !== 0) return dateCompare;
               return a.time.localeCompare(b.time);
            });

            // 4. Update the entry for the current professor
            allProfessorAvailability[currentUserEmail] = combinedSlots;

            // 5. Save the entire modified availability object back to localStorage
            localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
        }
   }, [currentUserEmail, selectedDate]);


  const toggleSlotAvailability = (id: string) => {
    // Find the slot to toggle within the current daily view
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle) {
       console.error("Slot not found in daily view:", id);
       return;
    }

    // Prevent changing availability if already booked
    if (slotToToggle.bookedBy) {
       toast({
           variant: "destructive",
           title: "Action Denied",
           description: "Cannot change availability of a booked slot.",
       });
       return;
    }

    // Create the updated list for the current day
    const updatedDailySlots = dailySlots.map((slot) =>
      slot.id === id ? { ...slot, isAvailable: !slot.isAvailable } : slot
    );

    // Update the UI state immediately
    setDailySlots(updatedDailySlots);

    // Persist the change using the centralized save function
    saveProfessorAvailability(updatedDailySlots);

    toast({
        title: slotToToggle.isAvailable ? "Slot Made Unavailable" : "Slot Made Available",
        description: `Slot at ${slotToToggle.time} on ${format(selectedDate!, 'PPP')} is now ${slotToToggle.isAvailable ? 'unavailable' : 'available'}.`
    })
  };

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Select a date to manage your bookable 60-minute slots within your assigned times.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2"> {/* Grid for Calendar + Table */}
          <div className="flex justify-center"> {/* Center Calendar */}
            <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
                disabled={(date) => isBefore(date, startOfDay(new Date()))} // Disable past dates
            />
          </div>

          <div> {/* Table for the selected date */}
            <h3 className="text-lg font-semibold mb-3">
              Manage Slots for {selectedDate ? format(selectedDate, 'PPP') : 'No date selected'} {/* Format selected date */}
            </h3>
             {dailySlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">
                    {selectedDate ? (isBefore(selectedDate, startOfDay(new Date())) ? "Cannot manage slots for past dates." : `No time slots assigned by admin for you on ${daysOfWeek[getDay(selectedDate)]}s.`) : 'Select a date to view slots.'}
                 </p>
             ) : (
                 <div className="overflow-x-auto border rounded-md max-h-96"> {/* Add max-height and scroll */}
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead className="w-24">Time</TableHead>
                         <TableHead className="w-20 text-center">Duration</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead className="w-40 text-center">Actions</TableHead>
                         <TableHead>Booking Info</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {dailySlots.map((slot) => {
                         const isBooked = slot.bookedBy !== null;
                         const statusText = isBooked ? 'Booked' : (slot.isAvailable ? 'Available' : 'Unavailable');
                         const statusColor = isBooked ? 'text-yellow-600' : (slot.isAvailable ? 'text-green-600' : 'text-red-600');

                         return (
                           <TableRow key={slot.id}>
                             <TableCell>{slot.time}</TableCell>
                             <TableCell className="text-center">{slot.duration} min</TableCell>
                             <TableCell className={`${statusColor} font-medium`}>{statusText}</TableCell>
                             <TableCell className="text-center">
                               <Button
                                 onClick={() => toggleSlotAvailability(slot.id)}
                                 disabled={isBooked} // Disable toggling if booked
                                 variant={slot.isAvailable ? 'destructive' : 'default'}
                                 size="sm"
                                 className={cn(
                                    'text-white', // Ensure text color contrasts with background
                                    isBooked
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : slot.isAvailable
                                            ? 'bg-red-600 hover:bg-red-700' // Destructive for "Make Unavailable"
                                            : 'bg-green-600 hover:bg-green-700' // Default/Success for "Make Available"
                                  )}
                               >
                                 {isBooked ? 'Booked' : (slot.isAvailable ? 'Make Unavailable' : 'Make Available')}
                               </Button>
                             </TableCell>
                             <TableCell>
                               {slot.bookedBy
                                 ? `By ${slot.bookedBy}${slot.bookingTime ? ` (${format(parseISO(slot.bookingTime), 'Pp')})` : ''}`
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


    