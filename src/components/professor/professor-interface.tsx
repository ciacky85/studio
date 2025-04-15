'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';

export function ProfessorInterface() {
  const [availableSlots, setAvailableSlots] = useState([
    {id: 1, classroom: 'Room 101', day: 'Monday', time: '8:00', duration: 60},
    {id: 2, classroom: 'Room 102', day: 'Tuesday', time: '17:00', duration: 30},
  ]);
  const [newSlotClassroom, setNewSlotClassroom] = useState('');
  const [newSlotDay, setNewSlotDay] = useState('');
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotDuration, setNewSlotDuration] = useState('');

  const addSlot = () => {
    const newSlot = {
      id: availableSlots.length + 1,
      classroom: newSlotClassroom,
      day: newSlotDay,
      time: newSlotTime,
      duration: parseInt(newSlotDuration),
    };
    setAvailableSlots([...availableSlots, newSlot]);
    setNewSlotClassroom('');
    setNewSlotDay('');
    setNewSlotTime('');
    setNewSlotDuration('');
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
            <ul>
              {availableSlots.map((slot) => (
                <li key={slot.id}>
                  {slot.classroom} - {slot.day} at {slot.time} ({slot.duration} minutes)
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="text"
              placeholder="Classroom"
              value={newSlotClassroom}
              onChange={(e) => setNewSlotClassroom(e.target.value)}
            />
            <Select onValueChange={(value) => setNewSlotDay(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Monday">Monday</SelectItem>
                <SelectItem value="Tuesday">Tuesday</SelectItem>
                <SelectItem value="Wednesday">Wednesday</SelectItem>
                <SelectItem value="Thursday">Thursday</SelectItem>
                <SelectItem value="Friday">Friday</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="time"
              placeholder="Time"
              value={newSlotTime}
              onChange={(e) => setNewSlotTime(e.target.value)}
            />
            <Select onValueChange={(value) => setNewSlotDuration(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>

            <Button className="col-span-2" onClick={addSlot}>
              Add Slot
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

