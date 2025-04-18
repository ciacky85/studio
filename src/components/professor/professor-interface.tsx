'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

export function ProfessorInterface() {
  const [availableSlots, setAvailableSlots] = useState([
    {id: 1, classroom: 'Room 101', day: 'Monday', time: '8:00', duration: 60, isAvailable: false, bookedBy: null, bookingTime: null},
    {id: 2, classroom: 'Room 102', day: 'Tuesday', time: '17:00', duration: 30, isAvailable: true, bookedBy: null, bookingTime: null},
  ]);

  const toggleSlotAvailability = (id: number) => {
    setAvailableSlots(
      availableSlots.map((slot) =>
        slot.id === id ? {...slot, isAvailable: !slot.isAvailable} : slot
      )
    );
  };

  // Function to simulate booking a slot by a student
  const bookSlot = (id: number, studentName: string) => {
    const now = new Date();
    setAvailableSlots(
      availableSlots.map((slot) =>
        slot.id === id
          ? {
              ...slot,
              bookedBy: studentName,
              bookingTime: now.toLocaleString(),
            }
          : slot
      )
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Professor Interface</CardTitle>
          <CardDescription>Manage available slots for students to book lessons.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3>Available Slots</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classroom</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Booking Info</TableHead> {/* New column */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableSlots.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell>{slot.classroom}</TableCell>
                    <TableCell>{slot.day}</TableCell>
                    <TableCell>{slot.time}</TableCell>
                    <TableCell>{slot.duration}</TableCell>
                    <TableCell>
                      {slot.isAvailable ? 'Available' : 'Not Available'}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => toggleSlotAvailability(slot.id)}
                        className={slot.isAvailable ? 'bg-red-500 hover:bg-red-700 text-white' : 'bg-green-500 hover:bg-green-700 text-white'}
                      >
                        {slot.isAvailable ? 'Remove' : 'Make Available'}
                      </Button>
                      <Button onClick={() => bookSlot(slot.id, 'Test Student')}>Simulate Booking</Button>
                    </TableCell>
                    <TableCell>
                      {slot.bookedBy ? `Booked by ${slot.bookedBy} on ${slot.bookingTime}` : 'Not Booked'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
