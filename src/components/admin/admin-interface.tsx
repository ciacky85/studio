'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {sendEmail} from '@/services/email'; // Import the email service
import {useToast} from "@/hooks/use-toast";

// Mocked pending registrations (replace with actual data source)
const mockedPendingRegistrations = [
  {id: 1, name: 'John Doe', role: 'student', email: 'john.doe@example.com'},
  {id: 2, name: 'Jane Smith', role: 'professor', email: 'jane.smith@example.com'},
  {id: 3, name: 'Test User', role: 'student', email: 'test@example.com'},
];

export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState(mockedPendingRegistrations);
  const [classrooms, setClassrooms] = useState([
    {id: 1, name: 'Room 101', availability: 'Mon 8:00-10:00, Tue 14:00-16:00'},
    {id: 2, name: 'Room 102', availability: 'Wed 9:00-11:00, Fri 13:00-15:00'},
  ]);

  // Sample list of professors (replace with actual data)
  //const professors = ['Professor A', 'Professor B', 'Professor C'];
  const [professors, setProfessors] = useState<string[]>([]);

  useEffect(() => {
    // Load professors from local storage
    const storedProfessors: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const userData = JSON.parse(localStorage.getItem(key) || '{}');
          if (userData.role === 'professor') {
            storedProfessors.push(key);
          }
        } catch (e) {
          console.error("Could not parse local storage", e);
        }
      }
    }
    setProfessors(storedProfessors);
  }, []);

  // Generate time slots from 7:00 to 23:00 in 30-minute intervals
  const timeSlots = generateTimeSlots();

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // State to hold the schedule (classroom, day, time, professor)
  const [schedule, setSchedule] = useState({});
  const {toast} = useToast();

  const approveRegistration = async (id: number) => {
    const registration = pendingRegistrations.find((reg) => reg.id === id);
    if (registration) {
      try {
        // Send approval email
        await sendEmail({
          to: registration.email,
          subject: 'Registration Approved',
          html: '<p>Your registration has been approved. You can now log in.</p>',
        });

        // Remove from pending registrations
        setPendingRegistrations(pendingRegistrations.filter((reg) => reg.id !== id));

        toast({
          title: "Registration Approved",
          description: `Registration for ${registration.email} has been approved.`,
        });
      } catch (error) {
        console.error("Error sending approval email:", error);
        toast({
          variant: "destructive",
          title: "Error Approving Registration",
          description: `Failed to send approval email to ${registration.email}.`,
        });
      }
    }
  };

  const rejectRegistration = async (id: number) => {
    const registration = pendingRegistrations.find((reg) => reg.id === id);
    if (registration) {
      try {
        // Send rejection email
        await sendEmail({
          to: registration.email,
          subject: 'Registration Rejected',
          html: '<p>Your registration has been rejected.</p>',
        });
        // Remove from pending registrations
        setPendingRegistrations(pendingRegistrations.filter((reg) => reg.id !== id));
        toast({
          title: "Registration Rejected",
          description: `Registration for ${registration.email} has been rejected.`,
        });
      } catch (error) {
        console.error("Error sending rejection email:", error);
        toast({
          variant: "destructive",
          title: "Error Rejecting Registration",
          description: `Failed to send rejection email to ${registration.email}.`,
        });
      }
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
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin Interface</CardTitle>
          <CardDescription>Manage user registrations and classroom availability.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs defaultvalue="classrooms" className="w-[400px]">
            <TabsList>
              <TabsTrigger value="classrooms">Classrooms</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
            </TabsList>
            <TabsContent value="classrooms">
              <h3>Classroom Schedule Management</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Time</TableHead>
                      {days.map((day) => (
                        <TableHead key={day} className="w-40">{day}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeSlots.map((time) => (
                      <TableRow key={time}>
                        <TableCell className="font-medium">{time}</TableCell>
                        {days.map((day) => (
                          <TableCell key={`${day}-${time}`}>
                            <Select onValueChange={(professor) => handleProfessorChange(day, time, professor)}>
                              <SelectTrigger className="w-full">
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
            </TabsContent>
            <TabsContent value="users">
              <h3>Pending Registrations</h3>
              <div className="overflow-x-auto">
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
