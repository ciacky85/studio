'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

export function StudentInterface() {
  const [availableSlots, setAvailableSlots] = useState([
    {id: 1, classroom: 'Room 101', day: 'Monday', time: '8:00', duration: 60, professor: 'John'},
    {id: 2, classroom: 'Room 102', day: 'Tuesday', time: '17:00', duration: 30, professor: 'Jane'},
  ]);
  const [bookedSlots, setBookedSlots] = useState([]);

  const bookSlot = (slot) => {
    setBookedSlots([...bookedSlots, slot]);
    setAvailableSlots(availableSlots.filter((s) => s.id !== slot.id));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Student Interface</CardTitle>
          <CardDescription>View available slots and book a lesson.</CardDescription>
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
                  <TableHead>Professor</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableSlots.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell>{slot.classroom}</TableCell>
                    <TableCell>{slot.day}</TableCell>
                    <TableCell>{slot.time}</TableCell>
                    <TableCell>{slot.duration}</TableCell>
                    <TableCell>{slot.professor}</TableCell>
                    <TableCell>
                      <Button onClick={() => bookSlot(slot)}>Book</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3>Booked Slots</h3>
            <ul>
              {bookedSlots.map((slot) => (
                <li key={slot.id}>
                  {slot.classroom} - {slot.day} at {slot.time} ({slot.duration} minutes)
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

