'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState([
    {id: 1, name: 'John Doe', role: 'student'},
    {id: 2, name: 'Jane Smith', role: 'professor'},
  ]);
  const [classrooms, setClassrooms] = useState([
    {id: 1, name: 'Room 101', availability: 'Mon 8:00-10:00, Tue 14:00-16:00'},
    {id: 2, name: 'Room 102', availability: 'Wed 9:00-11:00, Fri 13:00-15:00'},
  ]);
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newClassroomAvailability, setNewClassroomAvailability] = useState('');

  const approveRegistration = (id: number) => {
    setPendingRegistrations(pendingRegistrations.filter((reg) => reg.id !== id));
  };

  const addClassroom = () => {
    const newClassroom = {
      id: classrooms.length + 1,
      name: newClassroomName,
      availability: newClassroomAvailability,
    };
    setClassrooms([...classrooms, newClassroom]);
    setNewClassroomName('');
    setNewClassroomAvailability('');
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRegistrations.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell>{reg.name}</TableCell>
                    <TableCell>{reg.role}</TableCell>
                    <TableCell>
                      <Button onClick={() => approveRegistration(reg.id)}>Approve</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3>Classroom Management</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Availability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classrooms.map((classroom) => (
                  <TableRow key={classroom.id}>
                    <TableCell>{classroom.name}</TableCell>
                    <TableCell>{classroom.availability}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                placeholder="Classroom Name"
                value={newClassroomName}
                onChange={(e) => setNewClassroomName(e.target.value)}
              />
              <Input
                type="text"
                placeholder="Availability"
                value={newClassroomAvailability}
                onChange={(e) => setNewClassroomAvailability(e.target.value)}
              />
              <Button className="col-span-2" onClick={addClassroom}>
                Add Classroom
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

