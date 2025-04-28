
'use client';

import {useState, useEffect, useCallback} from 'react';
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
import { format, parseISO } from 'date-fns'; // Import date-fns functions
import {ManageStudentProfessorsDialog} from './manage-student-professors-dialog'; // Import the new dialog

// Define the structure for user display, including assigned professors for students
interface DisplayUser {
  id: number;
  name: string;
  role: string;
  email: string;
  assignedProfessorEmails?: string[] | null; // Changed field name and type
}

// Define the structure of a bookable slot (from professor/student perspective)
interface BookableSlot {
    id: string;
    date: string; // 'YYYY-MM-DD'
    day: string;
    time: string; // 'HH:MM'
    duration: number; // e.g., 60
    isAvailable: boolean;
    bookedBy: string | null; // Student email
    bookingTime: string | null; // ISO string timestamp
    professorEmail: string;
}

// Key for storing all professors' availability (date-specific slots) in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for classroom schedule
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]); // State for approved users
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<Record<string, string>>({}); // Key: "Day-Time", Value: Professor Email or ""
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]); // State for all booked slots
  const [isManageProfessorsDialogOpen, setIsManageProfessorsDialogOpen] = useState(false);
  const [selectedStudentForProfessorManagement, setSelectedStudentForProfessorManagement] = useState<DisplayUser | null>(null);


  const {toast} = useToast();

  // Function to sort slots consistently by date then time
   const sortSlots = (slots: BookableSlot[]) => {
      return slots.sort((a, b) => {
          // Defensive check for invalid slot data before sorting
          if (!a?.date || !b?.date || !a?.time || !b?.time) {
              console.warn('Tentativo di ordinare dati slot non validi:', a, b);
              return 0; // Avoid erroring, maintain relative order
          }
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          // Simple string comparison works for HH:00 format
          return a.time.localeCompare(b.time);
      });
   };


  // Function to load users AND all booked slots from localStorage
  const loadData = useCallback(() => {
    if (typeof window !== 'undefined') {
      const loadedPending: DisplayUser[] = [];
      const loadedApproved: DisplayUser[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      // Load Users
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Basic check to avoid parsing non-user/non-schedule items
        if (key && ![CLASSROOM_SCHEDULE_KEY, 'availableSlots', 'loggedInUser', ALL_PROFESSOR_AVAILABILITY_KEY].includes(key)) { // Exclude known non-user keys
          try {
            const item = localStorage.getItem(key);
            if (item) {
              // Adjust type expectation for assignedProfessorEmail to be string[]
              const userData: UserData & { password?: string } = JSON.parse(item);

              // Check if it looks like a user registration entry
              if (userData.role && typeof userData.approved === 'boolean') { // Check if role and approved status exist
                 const name = key.split('@')[0]; // Simple name extraction from email
                 const userDisplayData: DisplayUser = {
                   id: idCounter++,
                   name: name,
                   role: userData.role,
                   email: key,
                   // Ensure assignedProfessorEmails is handled as an array or null
                   assignedProfessorEmails: Array.isArray(userData.assignedProfessorEmail) ? userData.assignedProfessorEmail : null,
                 };

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
      setProfessors(loadedProfessors.sort()); // Sort professors alphabetically

      // Load All Booked Slots (remains the same)
      const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
      let allProfessorAvailability: Record<string, BookableSlot[]> = {}; // Key: professorEmail
        if (storedAvailability) {
          try {
            const parsedAvailability = JSON.parse(storedAvailability);
             if (typeof parsedAvailability === 'object' && parsedAvailability !== null) {
                 allProfessorAvailability = parsedAvailability;
             } else {
                  console.warn("Formato allProfessorAvailability non valido trovato in localStorage.");
                  allProfessorAvailability = {}; // Reset if invalid
             }
          } catch (e) {
            console.error("Impossibile analizzare allProfessorAvailability", e);
            allProfessorAvailability = {};
          }
        }

        const loadedAllBooked: BookableSlot[] = [];
        // Iterate through each professor's list of slots
         Object.values(allProfessorAvailability).flat().forEach(slot => {
             // Validate the slot structure and check if it's booked
             if (slot && slot.id && slot.date && slot.time && slot.bookedBy && slot.professorEmail && slot.duration === 60) {
                loadedAllBooked.push(slot);
             }
         });

        // Sort and set the state
        setAllBookedSlots(sortSlots(loadedAllBooked));
    }
  }, []); // Empty dependency array, will run on mount

  // Load all data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);


  // Load schedule from local storage on component mount (remains the same)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedSchedule = localStorage.getItem(CLASSROOM_SCHEDULE_KEY);
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

  // Save schedule to local storage whenever it changes (remains the same)
  useEffect(() => {
     // Only save if schedule is not empty, prevents overwriting on initial load before data is ready
     if (typeof window !== 'undefined' && Object.keys(schedule).length > 0) {
       localStorage.setItem(CLASSROOM_SCHEDULE_KEY, JSON.stringify(schedule));
     }
  }, [schedule]); // Dependency array includes schedule

  const approveRegistration = async (email: string) => {
    if (typeof window !== 'undefined') {
      const userDataString = localStorage.getItem(email);
      if (userDataString) {
        try {
          let userData: UserData = JSON.parse(userDataString);
          userData.approved = true; // Mark as approved
          // Initialize assignedProfessorEmails as null or empty array for students upon approval
          if(userData.role === 'student') {
             userData.assignedProfessorEmail = userData.assignedProfessorEmail || null; // Keep existing if somehow set, else null
          }
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
             // Add the user to approved list, ensuring assignedProfessorEmails is handled correctly
             const approvedUserData: DisplayUser = {
                ...userToApprove,
                assignedProfessorEmails: userData.assignedProfessorEmail // Pass the potentially updated array/null value
             };
            setApprovedUsers(prev => [...prev, approvedUserData]);
            // If the approved user is a professor, update the professor list used for scheduling
            if (userToApprove.role === 'professor') {
              setProfessors(prev => [...prev, email].sort()); // Add and sort
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

  // Function to generate time slots (HOURLY) (remains the same)
  function generateTimeSlots() {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
    }
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
            localStorage.setItem(CLASSROOM_SCHEDULE_KEY, JSON.stringify(newSchedule));
        }
        return newSchedule;
    });
  };


  // Function called when saving assigned professors from the dialog
  const handleSaveStudentProfessors = (studentEmail: string, assignedEmails: string[]) => {
    if (typeof window !== 'undefined') {
        const studentDataString = localStorage.getItem(studentEmail);
        if (studentDataString) {
            try {
                let studentData: UserData = JSON.parse(studentDataString);
                studentData.assignedProfessorEmail = assignedEmails.length > 0 ? assignedEmails : null; // Store array or null if empty
                localStorage.setItem(studentEmail, JSON.stringify(studentData));

                // Update the state to reflect the change in the UI
                setApprovedUsers(prevUsers =>
                    prevUsers.map(user =>
                        user.email === studentEmail
                            ? { ...user, assignedProfessorEmails: studentData.assignedProfessorEmail }
                            : user
                    )
                );

                toast({
                    title: "Professori Aggiornati",
                    description: `Le assegnazioni dei professori per ${studentEmail} sono state aggiornate.`,
                });
                setIsManageProfessorsDialogOpen(false); // Close the dialog
                setSelectedStudentForProfessorManagement(null); // Deselect student
            } catch (error) {
                console.error("Errore durante l'aggiornamento dei professori assegnati:", studentEmail, assignedEmails, error);
                toast({
                    variant: "destructive",
                    title: "Errore Aggiornamento",
                    description: `Impossibile aggiornare i professori assegnati. Errore: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        } else {
            toast({ variant: "destructive", title: "Errore", description: "Dati studente non trovati." });
        }
    }
};

const openManageProfessorsDialog = (student: DisplayUser) => {
    setSelectedStudentForProfessorManagement(student);
    setIsManageProfessorsDialogOpen(true);
};


  return (
    <>
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Amministratore</CardTitle>
          <CardDescription>Gestisci registrazioni utenti, disponibilità aule e visualizza le prenotazioni.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Use w-full or responsive width */}
          <Tabs defaultValue="classrooms" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3"> {/* Changed to 3 columns */}
              <TabsTrigger value="classrooms">Aule</TabsTrigger>
              <TabsTrigger value="users">Utenti</TabsTrigger>
              <TabsTrigger value="bookings">Prenotazioni</TabsTrigger> {/* New Tab */}
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
                     <CardDescription>Elenco di tutti gli utenti registrati e approvati. Assegna professori agli studenti.</CardDescription>
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
                                         <TableHead>Professori Assegnati</TableHead> {/* Changed column header */}
                                         <TableHead>Azioni</TableHead> {/* New column for actions */}
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {approvedUsers.map((user) => (
                                         <TableRow key={`approved-${user.id}`}>
                                             <TableCell>{user.name}</TableCell>
                                             <TableCell>{user.role === 'professor' ? 'Professore' : 'Studente'}</TableCell>
                                             <TableCell>{user.email}</TableCell>
                                             <TableCell> {/* Display assigned professors */}
                                                 {user.role === 'student' ? (
                                                     (user.assignedProfessorEmails && user.assignedProfessorEmails.length > 0)
                                                         ? user.assignedProfessorEmails.join(', ')
                                                         : 'Nessuno'
                                                 ) : (
                                                     'N/A' // Not applicable for professors
                                                 )}
                                             </TableCell>
                                             <TableCell> {/* Action Button Cell */}
                                                {user.role === 'student' ? (
                                                    <Button
                                                        onClick={() => openManageProfessorsDialog(user)}
                                                        size="sm"
                                                        variant="outline"
                                                    >
                                                        Gestisci Professori
                                                    </Button>
                                                ) : (
                                                    ' ' // Empty cell for non-students
                                                )}
                                            </TableCell>
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
            {/* New Bookings Tab Content (remains the same) */}
            <TabsContent value="bookings">
                 <Card>
                     <CardHeader>
                         <CardTitle>Tutte le Lezioni Prenotate</CardTitle>
                         <CardDescription>Elenco di tutte le lezioni prenotate nel sistema, ordinate per data.</CardDescription>
                     </CardHeader>
                     <CardContent>
                         <div className="overflow-x-auto">
                             {allBookedSlots.length > 0 ? (
                                 <Table>
                                     <TableHeader>
                                         <TableRow>
                                             <TableHead>Data</TableHead>
                                             <TableHead>Ora</TableHead>
                                             <TableHead>Professore</TableHead>
                                             <TableHead>Studente</TableHead>
                                             <TableHead>Ora Prenotazione</TableHead>
                                         </TableRow>
                                     </TableHeader>
                                     <TableBody>
                                         {allBookedSlots.map((slot) => (
                                             <TableRow key={`booked-${slot.id}`}>
                                                 <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy')}</TableCell>
                                                 <TableCell>{slot.time}</TableCell>
                                                 <TableCell>{slot.professorEmail}</TableCell>
                                                 <TableCell>{slot.bookedBy}</TableCell>
                                                 <TableCell>{slot.bookingTime ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm') : 'N/A'}</TableCell>
                                             </TableRow>
                                         ))}
                                     </TableBody>
                                 </Table>
                             ) : (
                                 <p>Nessuna lezione prenotata al momento.</p>
                             )}
                         </div>
                     </CardContent>
                 </Card>
             </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
    {/* Dialog for Managing Student Professors */}
    {selectedStudentForProfessorManagement && (
        <ManageStudentProfessorsDialog
            isOpen={isManageProfessorsDialogOpen}
            onClose={() => {
                setIsManageProfessorsDialogOpen(false);
                setSelectedStudentForProfessorManagement(null);
            }}
            student={selectedStudentForProfessorManagement}
            allProfessors={professors}
            onSave={handleSaveStudentProfessors}
        />
    )}
    </>
  );
}
