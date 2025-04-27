
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns'; // Import date-fns functions

// Define the structure of a slot as seen by the student (now 60 min)
interface StudentSlotView {
  id: string; // 'YYYY-MM-DD-HH:mm-professorEmail' unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time (e.g., 08:00)
  duration: number; // Now 60 min
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
          // Simple string comparison works for HH:mm format
          return a.time.localeCompare(b.time);
      });
   };

   // Get current user email on mount
   useEffect(() => {
     if (typeof window !== 'undefined') {
       const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
       if (storedUser) {
         try {
           const userData = JSON.parse(storedUser);
           if (userData.role === 'student') {
              setCurrentUserEmail(userData.username);
           } else {
               console.error("Logged in user is not a student.");
           }
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

     // Load all professors' availability (which now contains date-specific slots)
     const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
     let allProfessorAvailability: Record<string, any[]> = {}; // { professorEmail: [slot1, slot2, ...] }
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

     // Iterate through each professor's list of slots
     Object.values(allProfessorAvailability).flat().forEach(slot => {
         // Basic validation of the slot structure read from storage
         // Check for duration explicitly
         if (slot && slot.id && slot.date && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail && typeof slot.duration === 'number') {
            const studentViewSlot: StudentSlotView = {
                id: slot.id,
                date: slot.date,
                day: slot.day,
                time: slot.time,
                duration: slot.duration, // Use stored duration
                professorEmail: slot.professorEmail,
                isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                bookingTime: slot.bookingTime || null, // Pass booking time
            };

             // Add to AVAILABLE list if:
             // 1. It's for the selected date
             // 2. The professor marked it as available
             // 3. It's not booked by anyone
             // 4. The slot start time is not in the past
             if (slot.date === formattedSelectedDate && slot.isAvailable && !slot.bookedBy) {
                 const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`); // Combine date and time for comparison
                 if (!isBefore(slotDateTime, new Date())) { // Check if the slot time is in the future
                      loadedAvailableForDate.push(studentViewSlot);
                 }
             }

             // Add to the user's BOOKED list if booked by them, regardless of date
            if (slot.bookedBy === currentUserEmail) {
                loadedBookedByUser.push(studentViewSlot);
            }
         } else {
              console.warn(`Invalid or incomplete slot structure found:`, slot); // Log if data structure is unexpected
         }
     });

      // Sort available slots for the selected date by time
      setAvailableSlots(sortSlots(loadedAvailableForDate));
      // Sort all booked slots for the user by date and then time
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

        // Find the specific professor's list of slots
        const professorSlots = allProfessorAvailability[slotToBook.professorEmail];
        if (!professorSlots || !Array.isArray(professorSlots)) {
             toast({ variant: "destructive", title: "Booking Error", description: "Professor's schedule not found." });
             return;
        }

        // Find the index of the specific slot to book
        const slotIndex = professorSlots.findIndex(s => s.id === slotToBook.id);
        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Booking Error", description: "Slot not found." });
            loadSlots(); // Refresh list in case it's outdated
            return;
        }
        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available and not in the past
        const slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
        if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
             toast({ variant: "destructive", title: "Booking Failed", description: "Slot is no longer available or is in the past." });
             loadSlots(); // Refresh the list to show the current state
             return;
        }

        // 3. Update the slot data: mark as booked by current user and record time
        const now = new Date();
        originalSlot.bookedBy = currentUserEmail;
        originalSlot.bookingTime = now.toISOString(); // Store booking time as ISO string
        // Although professor sets isAvailable, we mark it false upon booking as a safety measure
        // The professor's view should still reflect bookedBy primarily
        originalSlot.isAvailable = false;

        // 4. Save updated data back to localStorage
        allProfessorAvailability[slotToBook.professorEmail] = professorSlots; // Update the professor's slot list
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

        // 5. Update UI state immediately by reloading slots
        loadSlots(); // Reload all slots to reflect the change

        toast({ title: "Booking Successful", description: `Lesson with ${slotToBook.professorEmail} booked for ${format(parseISO(slotToBook.date), 'PPP')} at ${slotToBook.time}.` });

        // Potential Email Confirmation (implement sendEmail service if needed)
        // try {
        //   await sendEmail({ to: currentUserEmail, subject: 'Booking Confirmation', html: `...` });
        //   await sendEmail({ to: slotToBook.professorEmail, subject: 'New Booking Notification', html: `...` });
        // } catch (emailError) {
        //   console.error("Failed to send booking confirmation emails:", emailError);
        //   // Optionally inform user, but booking itself succeeded
        //   toast({ variant: "destructive", title: "Email Error", description: "Booking confirmed, but failed to send confirmation email." });
        // }

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

           // Find the professor's slot list
           const professorSlots = allProfessorAvailability[slotToCancel.professorEmail];
            if (!professorSlots || !Array.isArray(professorSlots)) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Professor's schedule not found." });
                return;
           }

            // Find the specific slot index
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
                 loadSlots(); // Refresh UI just in case
                 return;
            }

            // --- 24-hour cancellation policy check ---
            // const bookingTime = originalSlot.bookingTime ? parseISO(originalSlot.bookingTime) : null; // Might use bookingTime if needed
            const lessonStartTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`);
            const now = new Date();

            if (differenceInHours(lessonStartTime, now) < 24) {
                 toast({
                     variant: "destructive",
                     title: "Cancellation Failed",
                     description: "Cannot cancel a lesson less than 24 hours in advance.",
                     duration: 5000, // Show longer
                 });
                 return; // Stop cancellation
            }
            // --- End 24-hour check ---

           // 3. Update slot data: remove booking info, mark as available (professor controls true availability)
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           // Professor should ideally re-enable 'isAvailable'. We set it true here assuming that's the default after cancellation.
           // The professor interface will still show it based on 'bookedBy' primarily.
           originalSlot.isAvailable = true;

           // 4. Save updated data back to localStorage
           allProfessorAvailability[slotToCancel.professorEmail] = professorSlots; // Update the professor's list
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // 5. Update UI state immediately by reloading slots
           loadSlots(); // Reload all slots

           toast({ title: "Booking Cancelled", description: `Your lesson with ${slotToCancel.professorEmail} on ${format(parseISO(slotToCancel.date), 'PPP')} at ${slotToCancel.time} has been cancelled.` });

            // Potential Cancellation Email Notifications
            // try {
            //    await sendEmail({ to: currentUserEmail, subject: 'Booking Cancellation Confirmation', html: `...` });
            //    await sendEmail({ to: slotToCancel.professorEmail, subject: 'Booking Cancelled by Student', html: `...` });
            // } catch (emailError) {
            //      console.error("Failed to send cancellation emails:", emailError);
            // }
       }
   }, [currentUserEmail, loadSlots, toast]); // Include loadSlots and toast


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Student Interface</CardTitle>
          <CardDescription>Select a date to view and book available 60-minute lesson slots.</CardDescription>
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
                     {selectedDate ? 'No slots available for booking on this date.' : 'Select a date to see available slots.'}
                 </p>
             ) : (
                  <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Time</TableHead>
                          <TableHead>Professor</TableHead>
                          <TableHead className="w-20">Duration</TableHead>
                          <TableHead className="w-28">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableSlots.map((slot) => (
                          <TableRow key={`available-${slot.id}`}>
                            <TableCell>{slot.time}</TableCell>
                            <TableCell>{slot.professorEmail}</TableCell>
                            <TableCell>{slot.duration} min</TableCell>
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
                         <TableHead className="w-20">Duration</TableHead>
                         <TableHead className="w-40">Actions</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                         {bookedSlots.map((slot) => {
                             const lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                             // Check if cancellation is allowed (more than 24 hours before)
                             const canCancel = differenceInHours(lessonDateTime, new Date()) >= 24;

                             return (
                                 <TableRow key={`booked-${slot.id}`}>
                                     <TableCell>{format(parseISO(slot.date), 'PPP')}</TableCell>
                                     <TableCell>{slot.time}</TableCell>
                                     <TableCell>{slot.professorEmail}</TableCell>
                                     <TableCell>{slot.duration} min</TableCell>
                                     <TableCell>
                                         <Button
                                             onClick={() => cancelBooking(slot)}
                                             variant="destructive"
                                             size="sm"
                                             disabled={!canCancel} // Disable if within 24 hours
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
