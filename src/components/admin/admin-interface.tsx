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
import type { UserData } from '@/types/user'; // Assuming UserData type is defined

// Mocked pending registrations (replace with actual data source if needed)
const mockedPendingRegistrations = [
    // Example structure, actual data loaded from localStorage
    // { id: 1, name: 'John Doe', role: 'student', email: 'john.doe@example.com' },
];

export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<{ id: number; name: string; role: string; email: string }[]>([]);
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Record<string, string>>({}); // Key: "Day-Time", Value: Professor Email or ""

  const {toast} = useToast();

  // Load pending registrations and professors from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadedPending: { id: number; name: string; role: string; email: string }[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key !== 'classroomSchedule' && key !== 'availableSlots' && key !== 'loggedInUser') { // Avoid parsing non-user data
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const userData: UserData & { password?: string } = JSON.parse(item); // Added password to type assertion for safety

              // Check if it looks like a user registration entry
              if (userData.role && (userData.approved === false || userData.approved === undefined)) {
                 // Assume name is derivable from email or add a name field during registration if needed
                 const name = key.split('@')[0]; // Simple name extraction from email
                 loadedPending.push({ id: idCounter++, name: name, role: userData.role, email: key });
              }

              if (userData.role === 'professor' && userData.approved !== false) {
                loadedProfessors.push(key); // Use email (key) as professor identifier
              }
            }
          } catch (e) {
            console.warn("Could not parse item from local storage for key (might not be user data):", key, e);
          }
        }
      }
      setPendingRegistrations(loadedPending);
      setProfessors(loadedProfessors);
    }
  }, []); // Run only on mount


  // Load schedule from local storage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedSchedule = localStorage.getItem('classroomSchedule');
      if (storedSchedule) {
        try {
          const parsedSchedule = JSON.parse(storedSchedule);
           // Basic validation: Check if it's an object
           if (typeof parsedSchedule === 'object' && parsedSchedule !== null) {
               setSchedule(parsedSchedule);
           } else {
                console.warn("Invalid schedule format found in localStorage. Initializing empty schedule.");
                setSchedule({}); // Initialize empty if format is wrong
           }
        } catch (e) {
          console.error("Failed to parse classroomSchedule from localStorage", e);
           setSchedule({}); // Initialize empty on parsing error
          // Optionally clear the invalid data
          // localStorage.removeItem('classroomSchedule');
        }
      } else {
          setSchedule({}); // Initialize empty if nothing is stored
      }
    }
  }, []); // Empty dependency array ensures this runs only on mount

  // Save schedule to local storage whenever it changes
  useEffect(() => {
     // Only save if schedule is not empty, prevents overwriting on initial load before data is ready
     if (typeof window !== 'undefined' && Object.keys(schedule).length > 0) {
       localStorage.setItem('classroomSchedule', JSON.stringify(schedule));
     }
  }, [schedule]); // Dependency array includes schedule

  const approveRegistration = async (email: string) => {
    if (typeof window !== 'undefined') {
      const userDataString = localStorage.getItem(email);
      if (userDataString) {
        try {
          const userData = JSON.parse(userDataString);
          userData.approved = true; // Mark as approved
          localStorage.setItem(email, JSON.stringify(userData)); // Update in localStorage

          // Send approval email
          await sendEmail({
            to: email,
            subject: 'Registration Approved',
            html: '<p>Your registration has been approved. You can now log in.</p>',
          });

          // Remove from pending registrations state
          setPendingRegistrations(prev => prev.filter((reg) => reg.email !== email));

          // Add to professors list if role is professor
          if (userData.role === 'professor') {
            setProfessors(prev => [...prev, email]);
          }

          toast({
            title: "Registration Approved",
            description: `Registration for ${email} has been approved.`,
          });
        } catch (error) {
           console.error("Error processing approval for:", email, error);
           toast({
             variant: "destructive",
             title: "Error Approving Registration",
             description: `Failed to approve registration for ${email}. Error: ${error instanceof Error ? error.message : String(error)}`,
           });
        }
      } else {
         toast({ variant: "destructive", title: "Error", description: "User data not found." });
      }
    }
  };

  const rejectRegistration = async (email: string) => {
     if (typeof window !== 'undefined') {
       const registration = pendingRegistrations.find((reg) => reg.email === email);
       if (registration) {
         try {
           localStorage.removeItem(email); // Remove registration from local storage

           // Send rejection email
           await sendEmail({
             to: email,
             subject: 'Registration Rejected',
             html: '<p>Your registration has been rejected.</p>',
           });
           // Remove from pending registrations state
           setPendingRegistrations(prev => prev.filter((reg) => reg.email !== email));
           toast({
             title: "Registration Rejected",
             description: `Registration for ${email} has been rejected.`,
           });
         } catch (error) {
            console.error("Error rejecting registration for:", email, error);
            toast({
              variant: "destructive",
              title: "Error Rejecting Registration",
              description: `Failed to send rejection email to ${email}. Error: ${error instanceof Error ? error.message : String(error)}`,
            });
         }
       } else {
            toast({ variant: "destructive", title: "Error", description: "Registration not found in pending list." });
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

  const timeSlots = generateTimeSlots();
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const handleProfessorChange = (day: string, time: string, professorEmail: string) => {
    const key = `${day}-${time}`;
    setSchedule(prevSchedule => ({
        ...prevSchedule,
        [key]: professorEmail === 'unassigned' ? '' : professorEmail // Store empty string for unassigned
    }));
    // The useEffect watching `schedule` will handle saving to localStorage
  };

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Admin Interface</CardTitle>
          <CardDescription>Manage user registrations and classroom availability.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Use w-full or specific width like max-w-4xl etc. */}
          <Tabs defaultValue="classrooms" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="classrooms">Classrooms</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
            </TabsList>
            <TabsContent value="classrooms">
              <Card>
                 <CardHeader>
                     <CardTitle>Classroom Schedule</CardTitle>
                     <CardDescription>Assign professors to available time slots.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead className="min-w-[80px] w-24 sticky left-0 bg-background z-10">Time</TableHead>
                                     {days.map((day) => (
                                         <TableHead key={day} className="min-w-[200px] w-40">{day}</TableHead>
                                     ))}
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                 {timeSlots.map((time) => (
                                     <TableRow key={time}>
                                         <TableCell className="font-medium sticky left-0 bg-background z-10">{time}</TableCell>
                                         {days.map((day) => {
                                            const scheduleKey = `${day}-${time}`;
                                            const assignedProfessor = schedule[scheduleKey] || ''; // Default to empty string if undefined
                                            return (
                                                <TableCell key={scheduleKey}>
                                                    <Select
                                                        value={assignedProfessor || 'unassigned'} // Ensure value corresponds to an item or 'unassigned'
                                                        onValueChange={(value) => handleProfessorChange(day, time, value)}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            {/* Display professor email or placeholder */}
                                                            <SelectValue placeholder="Assign Professor">
                                                                {assignedProfessor || "Assign Professor"}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="unassigned">Unassigned</SelectItem>
                                                            {professors.map((profEmail) => (
                                                                <SelectItem key={profEmail} value={profEmail}>
                                                                    {profEmail}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            );
                                         })}
                                     </TableRow>
                                 ))}
                             </TableBody>
                         </Table>
                     </div>
                 </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="users">
             <Card>
                 <CardHeader>
                     <CardTitle>Pending Registrations</CardTitle>
                     <CardDescription>Approve or reject new user registrations.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         {pendingRegistrations.length > 0 ? (
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
                                             <TableCell className="flex gap-2">
                                                 <Button onClick={() => approveRegistration(reg.email)} size="sm">Approve</Button>
                                                 <Button onClick={() => rejectRegistration(reg.email)} variant="destructive" size="sm">Reject</Button>
                                             </TableCell>
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                         ) : (
                             <p>No pending registrations.</p>
                         )}
                     </div>
                 </CardContent>
             </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
