'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {sendEmail} from '@/services/email'; // Import the email service

export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState([
    {id: 1, name: 'John Doe', role: 'student', email: 'john.doe@example.com'},
    {id: 2, name: 'Jane Smith', role: 'professor', email: 'jane.smith@example.com'},
  ]);
  const [classrooms, setClassrooms] = useState([
    {id: 1, name: 'Room 101', availability: 'Mon 8:00-10:00, Tue 14:00-16:00'},
    {id: 2, name: 'Room 102', availability: 'Wed 9:00-11:00, Fri 13:00-15:00'},
  ]);

  // Sample list of professors (replace with actual data)
  const professors = ['Professor A', 'Professor B', 'Professor C'];

  // Generate time slots from 7:00 to 23:00 in 30-minute intervals
  const timeSlots = generateTimeSlots();

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // State to hold the schedule (classroom, day, time, professor)
  const [schedule, setSchedule] = useState({});

  const approveRegistration = async (id: number) => {
    const registration = pendingRegistrations.find((reg) => reg.id === id);
    if (registration) {
      // Send approval email
      await sendEmail({
        to: registration.email,
        subject: 'Registration Approved',
        html: '<p>Your registration has been approved. You can now log in.</p>',
      });

      // Remove from pending registrations
      setPendingRegistrations(pendingRegistrations.filter((reg) => reg.id !== id));
    }
  };

  const rejectRegistration = async (id: number) => {
    const registration = pendingRegistrations.find((reg) => reg.id === id);
    if (registration) {
      // Send rejection email
      await sendEmail({
        to: registration.email,
        subject: 'Registration Rejected',
        html: '<p>Your registration has been rejected.</p>',
      });
      // Remove from pending registrations
      setPendingRegistrations(pendingRegistrations.filter((reg) => reg.id !== id));
    }
  };
  // Function to generate time slots
  function generateTimeSlots() {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
      slots.push(`${String(hour).padStart(2, '0')}:30`);
    }
    slots.push('23:00'); // Add 23:00
    return slots;
  }

  const handleProfessorChange = (day: string, time: string, professor: string) => {
    setSchedule({...schedule, [`${day}-${time}`]: professor});
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin Interface</CardTitle>
          <CardDescription>Manage user registrations and classroom availability.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3>Pending Registrations</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRegistrations.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell>{reg.name}</TableCell>
                    <TableCell>{reg.role}</TableCell>
                    <TableCell>{reg.email}</TableCell>
                    <TableCell>
                      <Button onClick={() => approveRegistration(reg.id)}>Approve</Button>
                      <Button onClick={() => rejectRegistration(reg.id)} variant="destructive">Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3>Classroom Schedule Management</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  {days.map((day) => (
                    <TableHead key={day}>{day}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeSlots.map((time) => (
                  <TableRow key={time}>
                    <TableCell>{time}</TableCell>
                    {days.map((day) => (
                      <TableCell key={`${day}-${time}`}>
                        <Select onValueChange={(professor) => handleProfessorChange(day, time, professor)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Assign Professor" />
                          </SelectTrigger>
                          <SelectContent>
                            {professors.map((professor) => (
                              <SelectItem key={professor} value={professor}>
                                {professor}
                              </SelectItem>
                            ))}
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    ))}
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
