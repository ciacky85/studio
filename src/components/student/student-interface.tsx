
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
// import {Calendar} from '@/components/ui/calendar'; // Remove Calendar import
import {useToast} from "@/hooks/use-toast";
import { format, isBefore, startOfDay, parseISO, differenceInHours } from 'date-fns'; // Import date-fns functions

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
  // const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()); // Remove selectedDate state
  const [allAvailableSlots, setAllAvailableSlots] = useState<StudentSlotView[]>([]); // State for ALL available slots
  const [bookedSlots, setBookedSlots] = useState<StudentSlotView[]>([]); // Still show all booked slots regardless of date
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const {toast} = useToast();

   // Function to sort slots consistently by date then time
   const sortSlots = (slots: StudentSlotView[]) => {
      return slots.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          // Simple string comparison works for HH:00 format
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
               // Optionally redirect or show error message
               // router.push('/');
           }
         } catch (e) {
           console.error("Error parsing loggedInUser data:", e);
         }
       } else {
         console.error("No user logged in.");
          // Optionally redirect or show error message
          // router.push('/');
       }
     }
   }, []);

  // Function to load slots based on selected date and all booked slots for the user
  const loadSlots = useCallback(() => {
     if (typeof window === 'undefined' || !currentUserEmail) {
         setAllAvailableSlots([]); // Clear all available slots
         setBookedSlots([]);
         return;
     }

     // const formattedSelectedDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null; // No longer needed

     // Load all professors' availability (which now contains date-specific slots)
     const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
     let allProfessorAvailability: Record<string, any[]> = {}; // { professorEmail: [slot1, slot2, ...] }
     if (storedAvailability) {
         try {
             allProfessorAvailability = JSON.parse(storedAvailability);
              if (typeof allProfessorAvailability !== 'object' || allProfessorAvailability === null) {
                  allProfessorAvailability = {}; // Reset if invalid
              }
         } catch (e) {
             console.error("Failed to parse allProfessorAvailability", e);
             allProfessorAvailability = {};
         }
     }

     const loadedAllAvailable: StudentSlotView[] = []; // Changed name
     const loadedBookedByUser: StudentSlotView[] = [];

     // Iterate through each professor's list of slots
     Object.values(allProfessorAvailability).flat().forEach(slot => {
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
             if (slot.isAvailable && !slot.bookedBy) { // Removed date check here
                 const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`); // Combine date and time for comparison (e.g., 2025-04-28T08:00:00)
                 if (!isBefore(slotDateTime, new Date())) { // Check if the slot time is in the future
                      loadedAllAvailable.push(studentViewSlot); // Add to the main available list
                 }
             }

             // Add to the user's BOOKED list if booked by them, regardless of date
            if (slot.bookedBy === currentUserEmail) {
                loadedBookedByUser.push(studentViewSlot);
            }
         } else if (slot && slot.duration !== 60) {
             // Optionally log if we find slots with incorrect duration, might indicate old data
             // console.warn(`Ignoring slot with incorrect duration (${slot.duration} min):`, slot);
         } else {
              // Log if data structure is unexpected or incomplete
              // console.warn(`Invalid or incomplete slot structure found:`, slot);
         }
     });

      // Sort all available slots by date and then time
      setAllAvailableSlots(sortSlots(loadedAllAvailable));
      // Sort all booked slots for the user by date and then time
      setBookedSlots(sortSlots(loadedBookedByUser));

  }, [currentUserEmail]); // Rerun when user changes, removed selectedDate dependency

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
            if (typeof allProfessorAvailability !== 'object' || allProfessorAvailability === null) {
                 allProfessorAvailability = {};
            }
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
        const slotIndex = professorSlots.findIndex(s => s.id === slotToBook.id && s.duration === 60); // Ensure it's the correct slot ID and duration
        if (slotIndex === -1) {
            toast({ variant: "destructive", title: "Booking Error", description: "Slot not found or invalid." });
            loadSlots(); // Refresh list in case it's outdated
            return;
        }
        const originalSlot = professorSlots[slotIndex];

        // 2. Check if the slot is still available (isAvailable == true) and not booked (bookedBy == null) and not in the past
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
        // Mark isAvailable as false upon booking, professor manages true availability but this prevents double booking
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
                 if (typeof allProfessorAvailability !== 'object' || allProfessorAvailability === null) {
                     allProfessorAvailability = {};
                 }
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
            const slotIndex = professorSlots.findIndex(s => s.id === slotToCancel.id && s.duration === 60);
            if (slotIndex === -1) {
                toast({ variant: "destructive", title: "Cancellation Error", description: "Slot not found or invalid." });
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
          <CardDescription>View and book available 60-minute lesson slots or manage your bookings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6"> {/* Removed md:grid-cols-2 */}
            {/* Removed Calendar Selection */}
            {/* <div className="flex justify-center">
               <Calendar
                 mode="single"
                 selected={selectedDate}
                 onSelect={setSelectedDate}
                 className="rounded-md border"
                 disabled={(date) => isBefore(date, startOfDay(new Date()))} // Disable past dates
               />
             </div> */}

           {/* Available Slots */}
           <div>
             <h3 className="text-lg font-semibold mb-3">
                Available Slots for Booking
             </h3>
             {allAvailableSlots.length === 0 ? (
                 <p className="text-muted-foreground p-4 text-center">
                     No 60-minute slots currently available for booking.
                 </p>
             ) : (
                  <div className="overflow-x-auto border rounded-md max-h-96"> {/* Max height and scroll */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Date</TableHead> {/* Added Date */}
                          <TableHead className="w-24">Time</TableHead>
                          <TableHead>Professor</TableHead>
                          <TableHead className="w-20 text-center">Duration</TableHead>
                          <TableHead className="w-28 text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allAvailableSlots.map((slot) => (
                          <TableRow key={`available-${slot.id}`}>
                            <TableCell>{format(parseISO(slot.date), 'PPP')}</TableCell> {/* Format date */}
                            <TableCell>{slot.time}</TableCell>
                            <TableCell>{slot.professorEmail}</TableCell>
                            <TableCell className="text-center">{slot.duration} min</TableCell>
                            <TableCell className="text-center">
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
           {/* Removed md:col-span-2 as we no longer have columns */}
           <div>
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
                         <TableHead className="w-20 text-center">Duration</TableHead>
                         <TableHead className="w-40 text-center">Actions</TableHead>
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
                                     <TableCell className="text-center">{slot.duration} min</TableCell>
                                     <TableCell className="text-center">
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
