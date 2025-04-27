'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useToast} from "@/hooks/use-toast";

// Define the structure of a slot
interface Slot {
  id: number;
  classroom: string;
  day: string;
  time: string;
  duration: number;
  isAvailable: boolean;
  bookedBy: string | null;
  bookingTime: string | null;
}


export function ProfessorInterface() {
  const [availableSlots, setAvailableSlots] = useState<Slot[]>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const storedSlots = localStorage.getItem('availableSlots');
      // Basic validation to ensure stored data is somewhat like what we expect
      try {
         const parsedSlots = storedSlots ? JSON.parse(storedSlots) : [];
         if (Array.isArray(parsedSlots) && parsedSlots.every(slot => typeof slot === 'object' && slot !== null && 'id' in slot)) {
           return parsedSlots;
         }
      } catch (e) {
        console.error("Failed to parse availableSlots from localStorage", e);
        // Fallback to default if parsing fails or data is invalid
      }
       // Fallback to default if localStorage is empty, invalid, or parsing failed
       return [
        {id: 1, classroom: 'Room 101', day: 'Monday', time: '8:00', duration: 60, isAvailable: false, bookedBy: null, bookingTime: null},
        {id: 2, classroom: 'Room 102', day: 'Tuesday', time: '17:00', duration: 30, isAvailable: true, bookedBy: null, bookingTime: null},
      ];
    }
    // Default value if window is not defined (e.g., during SSR pre-hydration)
    return [
       {id: 1, classroom: 'Room 101', day: 'Monday', time: '8:00', duration: 60, isAvailable: false, bookedBy: null, bookingTime: null},
       {id: 2, classroom: 'Room 102', day: 'Tuesday', time: '17:00', duration: 30, isAvailable: true, bookedBy: null, bookingTime: null},
     ];
  });

  useEffect(() => {
    // Save to localStorage whenever availableSlots changes
    // Ensure this only runs client-side
    if (typeof window !== 'undefined') {
       localStorage.setItem('availableSlots', JSON.stringify(availableSlots));
    }
  }, [availableSlots]);

  const toggleSlotAvailability = (id: number) => {
    setAvailableSlots(
      availableSlots.map((slot) =>
        slot.id === id ? {...slot, isAvailable: !slot.isAvailable} : slot
      )
    );
  };

  // Function to simulate booking a slot by a student (for testing display)
  const bookSlot = (id: number, studentName: string) => {
    const now = new Date();
    setAvailableSlots(
      availableSlots.map((slot) =>
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
  };

  const {toast} = useToast();

  // Example: Simulate a student booking slot 1 after 5 seconds
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     bookSlot(1, 'Alice');
  //     toast({ title: "Slot Booked", description: "Slot 1 booked by Alice for testing." });
  //   }, 5000);
  //   return () => clearTimeout(timer); // Cleanup timer on component unmount
  // }, []);


  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Manage available slots for students to book lessons.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3>Available Slots</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classroom</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Booking Info</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableSlots.map((slot) => {
                    const isBooked = slot.bookedBy !== null;
                    const statusText = isBooked ? 'Booked' : (slot.isAvailable ? 'Available' : 'Not Available');
                    return (
                      <TableRow key={slot.id}>
                        <TableCell>{slot.classroom}</TableCell>
                        <TableCell>{slot.day}</TableCell>
                        <TableCell>{slot.time}</TableCell>
                        <TableCell>{slot.duration} min</TableCell>
                        <TableCell>{statusText}</TableCell>
                        <TableCell>
                          <Button
                            onClick={() => toggleSlotAvailability(slot.id)}
                            className={slot.isAvailable ? 'bg-red-500 hover:bg-red-700 text-white' : 'bg-green-500 hover:bg-green-700 text-white'}
                            disabled={isBooked} // Disable toggling if booked
                            variant={slot.isAvailable ? 'destructive' : 'default'}
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
