
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
import { Separator } from '@/components/ui/separator'; // Import Separator

// Define the structure for user display
interface DisplayUser {
  id: number;
  name: string;
  role: string;
  email: string;
}


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]); // State for approved users
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Record<string, string>>({}); // Key: "Day-Time", Value: Professor Email or ""

  const {toast} = useToast();

  // Function to load users from localStorage
  const loadUsers = () => {
    if (typeof window !== 'undefined') {
      const loadedPending: DisplayUser[] = [];
      const loadedApproved: DisplayUser[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Basic check to avoid parsing non-user/non-schedule items
        if (key && !['classroomSchedule', 'availableSlots', 'loggedInUser', 'allProfessorAvailability'].includes(key)) { // Exclude allProfessorAvailability
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const userData: UserData & { password?: string } = JSON.parse(item);

              // Check if it looks like a user registration entry
              if (userData.role && typeof userData.approved === 'boolean') { // Check if role and approved status exist
                 const name = key.split('@')[0]; // Simple name extraction from email
                 const userDisplayData: DisplayUser = { id: idCounter++, name: name, role: userData.role, email: key };

                 if (userData.approved === true) {
                   loadedApproved.push(userDisplayData);
                   if (userData.role === 'professor') {
                     loadedProfessors.push(key); // Add approved professors to the list
                   }
                 } else { // approved === false means pending
                   loadedPending.push(userDisplayData);
                 }
              }
            }
          } catch (e) {
            console.warn("Impossibile analizzare l'elemento da local storage per la chiave (potrebbero non essere dati utente):", key, e);
          }
        }
      }
      setPendingRegistrations(loadedPending);
      setApprovedUsers(loadedApproved);
      setProfessors(loadedProfessors);
    }
  };

  // Load pending/approved registrations and professors from localStorage on mount
  useEffect(() => {
    loadUsers();
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
                console.warn("Formato orario non valido trovato in localStorage. Inizializzazione orario vuoto.");
                setSchedule({}); // Initialize empty if format is wrong
           }
        } catch (e) {
          console.error("Impossibile analizzare classroomSchedule da localStorage", e);
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
          let userData: UserData = JSON.parse(userDataString);
          userData.approved = true; // Mark as approved
          localStorage.setItem(email, JSON.stringify(userData)); // Update in localStorage

          // Find the user in pending list to move them
          const userToApprove = pendingRegistrations.find((reg) => reg.email === email);

          // Send approval email
          await sendEmail({
            to: email,
            subject: 'Registrazione Approvata',
            html: '<p>La tua registrazione è stata approvata. Ora puoi accedere.</p>',
          });

          // Update states: remove from pending, add to approved
          setPendingRegistrations(prev => prev.filter((reg) => reg.email !== email));
          if (userToApprove) {
            setApprovedUsers(prev => [...prev, userToApprove]); // Add to approved list
            // If the approved user is a professor, update the professor list used for scheduling
            if (userToApprove.role === 'professor') {
              setProfessors(prev => [...prev, email]);
            }
          }


          toast({
            title: "Registrazione Approvata",
            description: `La registrazione per ${email} è stata approvata.`,
          });
        } catch (error) {
           console.error("Errore durante l'approvazione per:", email, error);
           toast({
             variant: "destructive",
             title: "Errore Approvazione Registrazione",
             description: `Impossibile approvare la registrazione per ${email}. Errore: ${error instanceof Error ? error.message : String(error)}`,
           });
        }
      } else {
         toast({ variant: "destructive", title: "Errore", description: "Dati utente non trovati." });
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
             subject: 'Registrazione Rifiutata',
             html: '<p>La tua registrazione è stata rifiutata.</p>',
           });
           // Remove from pending registrations state
           setPendingRegistrations(prev => prev.filter((reg) => reg.email !== email));
           toast({
             title: "Registrazione Rifiutata",
             description: `La registrazione per ${email} è stata rifiutata.`,
           });
         } catch (error) {
            console.error("Errore durante il rifiuto della registrazione per:", email, error);
            toast({
              variant: "destructive",
              title: "Errore Rifiuto Registrazione",
              description: `Impossibile inviare email di rifiuto a ${email}. Errore: ${error instanceof Error ? error.message : String(error)}`,
            });
         }
       } else {
            toast({ variant: "destructive", title: "Errore", description: "Registrazione non trovata nell'elenco in sospeso." });
       }
     }
   };

  // Function to generate time slots (HOURLY)
  function generateTimeSlots() {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
    }
    // No need to add 23:00 separately if the loop includes <= 22
    return slots;
  }

  const timeSlots = generateTimeSlots();
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']; // Italian days

  const handleProfessorChange = (day: string, time: string, professorEmail: string) => {
    const key = `${day}-${time}`;
    setSchedule(prevSchedule => {
        const newSchedule = { ...prevSchedule, [key]: professorEmail === 'unassigned' ? '' : professorEmail };
        // Save to localStorage immediately after state update
        if (typeof window !== 'undefined') {
            localStorage.setItem('classroomSchedule', JSON.stringify(newSchedule));
        }
        return newSchedule;
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Amministratore</CardTitle>
          <CardDescription>Gestisci registrazioni utenti e disponibilità aule.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Use w-full or responsive width */}
          <Tabs defaultValue="classrooms" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2">
              <TabsTrigger value="classrooms">Aule</TabsTrigger>
              <TabsTrigger value="users">Utenti</TabsTrigger>
            </TabsList>
            <TabsContent value="classrooms">
              <Card>
                 <CardHeader>
                     <CardTitle>Orario Aule</CardTitle>
                     <CardDescription>Assegna professori agli slot orari disponibili.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead className="min-w-[80px] w-24 sticky left-0 bg-background z-10">Ora</TableHead>
                                     {days.map((day) => (
                                         <TableHead key={day} className="min-w-[200px] w-48">{day}</TableHead>
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
                                                            <SelectValue placeholder="Assegna Professore">
                                                                {assignedProfessor || "Assegna Professore"}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="unassigned">Non Assegnato</SelectItem>
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
                     <CardTitle>Registrazioni in Sospeso</CardTitle>
                     <CardDescription>Approva o rifiuta nuove registrazioni utente.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         {pendingRegistrations.length > 0 ? (
                             <Table>
                                 <TableHeader>
                                     <TableRow>
                                         <TableHead>Nome</TableHead>
                                         <TableHead>Ruolo</TableHead>
                                         <TableHead>Email</TableHead>
                                         <TableHead>Azioni</TableHead>
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {pendingRegistrations.map((reg) => (
                                         <TableRow key={`pending-${reg.id}`}>
                                             <TableCell>{reg.name}</TableCell>
                                             <TableCell>{reg.role === 'professor' ? 'Professore' : 'Studente'}</TableCell>
                                             <TableCell>{reg.email}</TableCell>
                                             <TableCell className="flex flex-wrap gap-2">
                                                 <Button onClick={() => approveRegistration(reg.email)} size="sm">Approva</Button>
                                                 <Button onClick={() => rejectRegistration(reg.email)} variant="destructive" size="sm">Rifiuta</Button>
                                             </TableCell>
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                         ) : (
                             <p>Nessuna registrazione in sospeso.</p>
                         )}
                     </div>
                 </CardContent>
             </Card>
             <Separator className="my-4" />
             <Card>
                <CardHeader>
                     <CardTitle>Utenti Approvati</CardTitle>
                     <CardDescription>Elenco di tutti gli utenti registrati e approvati.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         {approvedUsers.length > 0 ? (
                             <Table>
                                 <TableHeader>
                                     <TableRow>
                                         <TableHead>Nome</TableHead>
                                         <TableHead>Ruolo</TableHead>
                                         <TableHead>Email</TableHead>
                                         {/* Add Actions column if needed later */}
                                         {/* <TableHead>Azioni</TableHead> */}
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {approvedUsers.map((user) => (
                                         <TableRow key={`approved-${user.id}`}>
                                             <TableCell>{user.name}</TableCell>
                                             <TableCell>{user.role === 'professor' ? 'Professore' : 'Studente'}</TableCell>
                                             <TableCell>{user.email}</TableCell>
                                             {/* Add Action buttons if needed */}
                                             {/* <TableCell className="flex gap-2"> */}
                                                {/* Example: <Button variant="outline" size="sm">Gestisci</Button> */}
                                             {/* </TableCell> */}
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                         ) : (
                             <p>Nessun utente approvato trovato.</p>
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
