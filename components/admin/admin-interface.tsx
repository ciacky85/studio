
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
import type { UserData, AllUsersData } from '@/types/user'; // Import UserData types
import type { BookableSlot } from '@/types/bookable-slot'; // Import BookableSlot type
import type { ScheduleAssignment } from '@/types/schedule-assignment'; // Import ScheduleAssignment type
import type { AllProfessorAvailabilityData, ClassroomScheduleData } from '@/types/app-data'; // Import centralized data types
import { Separator } from '@/components/ui/separator'; // Import Separator
import { format, parseISO } from 'date-fns'; // Import date-fns functions
import { ManageUserProfessorsDialog } from './manage-user-professors-dialog';
import { cn } from "@/lib/utils"; // Import cn for conditional classes
import type {DisplayUser} from '@/types/display-user'; // Use DisplayUser type
import { it } from 'date-fns/locale'; // Import Italian locale
import { readData, writeData, deleteData } from '@/services/data-storage'; // Import data storage service

// Constants for filenames
const USERS_DATA_FILE = 'users';
const ALL_PROFESSOR_AVAILABILITY_FILE = 'allProfessorAvailability';
const CLASSROOM_SCHEDULE_FILE = 'classroomSchedule'; // Using simple name now

// Define available classrooms
const classrooms = ['Aula 1 Grande', 'Aula 2 Piccola'];

// Define a color palette for professors
const professorColors = [
  'bg-blue-100 dark:bg-blue-900',
  'bg-yellow-100 dark:bg-yellow-900',
  'bg-purple-100 dark:bg-purple-900',
  'bg-pink-100 dark:bg-pink-900',
  'bg-indigo-100 dark:bg-indigo-900',
  'bg-teal-100 dark:bg-teal-900',
  'bg-orange-100 dark:bg-orange-900',
  'bg-lime-100 dark:bg-lime-900',
  'bg-cyan-100 dark:bg-cyan-900',
  'bg-emerald-100 dark:bg-emerald-900',
];

// Function to get a color class based on professor email
const getProfessorColor = (professorEmail: string, allProfessors: string[]): string => {
    const index = allProfessors.indexOf(professorEmail);
    if (index === -1 || !professorEmail) { // Handle case where professorEmail might be empty string
        return ''; // No color if professor not found or unassigned
    }
    return professorColors[index % professorColors.length];
};


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]); // State for approved users
  const [professors, setProfessors] = useState<string[]>([]);
  // Schedule structure: Key: "Day-Time-Classroom", Value: { professor: string }
  const [schedule, setSchedule] = useState<ClassroomScheduleData>({}); // Use type from app-data
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]); // State for all booked slots
  const [isManageProfessorsDialogOpen, setIsManageProfessorsDialogOpen] = useState(false);
  const [selectedUserForProfessorManagement, setSelectedUserForProfessorManagement] = useState<DisplayUser | null>(null);


  const {toast} = useToast();

  // Function to sort slots consistently by date then time
   const sortSlots = (slots: BookableSlot[]) => {
      return slots.sort((a, b) => {
          if (!a?.date || !b?.date || !a?.time || !b?.time) {
              console.warn('Tentativo di ordinare dati slot non validi:', a, b);
              return 0;
          }
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.time.localeCompare(b.time);
      });
   };


  // Function to load all data from files
  const loadData = useCallback(async () => {
    try {
        // Load Users
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const loadedPending: DisplayUser[] = [];
        const loadedApproved: DisplayUser[] = [];
        const loadedProfessors: string[] = [];
        let idCounter = 1; // Simple ID generation for UI keys

        Object.entries(allUsers).forEach(([email, userData]) => {
             // Ensure it's a valid user entry
             if (userData && userData.role && typeof userData.approved === 'boolean') {
                 const name = email.split('@')[0]; // Simple name extraction
                 const userDisplayData: DisplayUser = {
                   id: idCounter++,
                   name: name,
                   role: userData.role,
                   email: email,
                   assignedProfessorEmails: Array.isArray(userData.assignedProfessorEmails) ? userData.assignedProfessorEmails : null,
                 };

                 if (userData.approved === true) {
                    if(userData.role !== 'admin') {
                        loadedApproved.push(userDisplayData);
                    }
                    if (userData.role === 'professor') {
                      loadedProfessors.push(email);
                    }
                 } else { // approved === false means pending
                    loadedPending.push(userDisplayData);
                 }
             }
        });

        setPendingRegistrations(loadedPending);
        setApprovedUsers(loadedApproved);
        setProfessors(loadedProfessors.sort()); // Sort professors alphabetically

        // Load All Booked Slots from allProfessorAvailability file
        const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
        const loadedAllBooked: BookableSlot[] = [];
        Object.values(allProfessorAvailability).flat().forEach(slot => {
            if (slot && slot.id && slot.date && slot.time && slot.classroom && slot.bookedBy && slot.professorEmail && slot.duration === 60) {
                loadedAllBooked.push(slot);
            }
        });
        setAllBookedSlots(sortSlots(loadedAllBooked));

        // Load Classroom Schedule
        const loadedSchedule = await readData<ClassroomScheduleData>(CLASSROOM_SCHEDULE_FILE, {});
        setSchedule(loadedSchedule);

    } catch (error) {
        console.error("Errore durante il caricamento dei dati:", error);
        toast({
            variant: "destructive",
            title: "Errore Caricamento Dati",
            description: "Impossibile caricare i dati dell'applicazione. Riprova più tardi.",
        });
        // Set default empty states on error
        setPendingRegistrations([]);
        setApprovedUsers([]);
        setProfessors([]);
        setSchedule({});
        setAllBookedSlots([]);
    }
  }, [toast]); // Added toast to dependency array

  // Load all data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);


  // Save classroom schedule to file whenever it changes
  useEffect(() => {
     // Only save if schedule is not empty to avoid overwriting with {} on initial load/error
     if (Object.keys(schedule).length > 0) {
         writeData(CLASSROOM_SCHEDULE_FILE, schedule).catch(error => {
             console.error("Errore durante il salvataggio dell'orario aule:", error);
             toast({ variant: "destructive", title: "Errore Salvataggio", description: "Impossibile salvare le modifiche all'orario." });
         });
     }
     // Note: We don't remove the file if the schedule becomes empty,
     // as an empty schedule is valid state ({})
  }, [schedule, toast]);

  const approveRegistration = async (email: string) => {
    try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const userData = allUsers[email];

        if (userData && !userData.approved) {
            userData.approved = true;
            userData.assignedProfessorEmails = userData.assignedProfessorEmails || null; // Initialize if needed

            // Write the updated user data back
            allUsers[email] = userData; // Ensure the update is in the object
            await writeData(USERS_DATA_FILE, allUsers);

            // Send approval email
            await sendEmail({
                to: email,
                subject: 'Registrazione Approvata',
                html: '<p>La tua registrazione è stata approvata. Ora puoi accedere.</p>',
            });

            // Refresh UI data after successful update and email
            await loadData();

            toast({
                title: "Registrazione Approvata",
                description: `La registrazione per ${email} è stata approvata.`,
            });
        } else if (userData && userData.approved) {
             toast({
                variant: "default", // Or "warning"
                title: "Utente Già Approvato",
                description: `${email} è già stato approvato.`,
            });
        } else {
            throw new Error("Utente non trovato.");
        }
    } catch (error) {
        console.error("Errore durante l'approvazione per:", email, error);
        toast({
            variant: "destructive",
            title: "Errore Approvazione Registrazione",
            description: `Impossibile approvare la registrazione per ${email}. Errore: ${error instanceof Error ? error.message : String(error)}`,
        });
        // Optionally reload data on error to ensure UI consistency
        await loadData();
    }
};


  const rejectRegistration = async (email: string) => {
     try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const registration = allUsers[email];

        if (registration && !registration.approved) {
            // Delete the user entry from the object
            delete allUsers[email];

            // Write the modified user data back (user removed)
            await writeData(USERS_DATA_FILE, allUsers);

            // Send rejection email
            await sendEmail({
                to: email,
                subject: 'Registrazione Rifiutata',
                html: '<p>La tua registrazione è stata rifiutata.</p>',
            });

             // Refresh UI data
            await loadData();

            toast({
                title: "Registrazione Rifiutata",
                description: `La registrazione per ${email} è stata rifiutata ed eliminata.`,
            });
        } else if (!registration) {
            toast({ variant: "destructive", title: "Errore", description: "Registrazione non trovata." });
            await loadData(); // Refresh UI
        } else { // User exists but is already approved
             toast({ variant: "default", title: "Azione Non Necessaria", description: "L'utente è già approvato." });
        }
     } catch (error) {
         console.error("Errore durante il rifiuto della registrazione per:", email, error);
         toast({
             variant: "destructive",
             title: "Errore Rifiuto Registrazione",
             description: `Impossibile rifiutare la registrazione per ${email}. Errore: ${error instanceof Error ? error.message : String(error)}`,
         });
          // Optionally reload data on error
         await loadData();
     }
   };

  // Function to generate time slots (HOURLY)
  function generateTimeSlots() {
    const slots = [];
    for (let hour = 7; hour <= 22; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
    }
    return slots;
  }

  const timeSlots = generateTimeSlots();
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']; // Italian days

  const handleProfessorAssignmentChange = (day: string, time: string, classroom: string, professorEmail: string) => {
    const key = `${day}-${time}-${classroom}`;
    const newAssignment: ScheduleAssignment = {
        professor: professorEmail === 'unassigned' ? '' : professorEmail
    };
    // Update the state optimistically for immediate UI feedback
    setSchedule(prevSchedule => ({ ...prevSchedule, [key]: newAssignment }));
    // Saving to file is handled by the useEffect hook listening to schedule changes
};


  // Updated function to handle saving assigned professors for ANY user (student or professor)
  const handleSaveUserProfessors = async (userEmail: string, assignedEmails: string[]) => {
    try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const userData = allUsers[userEmail];

        if (userData) {
            userData.assignedProfessorEmails = assignedEmails.length > 0 ? assignedEmails : null; // Store array or null if empty

            // Write the updated user data back
             allUsers[userEmail] = userData; // Ensure the update is in the object
            await writeData(USERS_DATA_FILE, allUsers);


            // Refresh UI data after successful update
            await loadData(); // This will update approvedUsers state

            toast({
                title: "Professori Aggiornati",
                description: `Le assegnazioni dei professori per ${userEmail} sono state aggiornate.`,
            });
            setIsManageProfessorsDialogOpen(false); // Close the dialog
            setSelectedUserForProfessorManagement(null); // Deselect user
        } else {
             throw new Error("Dati utente non trovati.");
        }
    } catch (error) {
        console.error("Errore durante l'aggiornamento dei professori assegnati:", userEmail, assignedEmails, error);
        toast({
            variant: "destructive",
            title: "Errore Aggiornamento",
            description: `Impossibile aggiornare i professori assegnati. Errore: ${error instanceof Error ? error.message : String(error)}`,
        });
        // Optionally reload data on error
        await loadData();
    }
};

// Updated function to open the dialog for ANY user (student or professor)
const openManageProfessorsDialog = (user: DisplayUser) => {
    setSelectedUserForProfessorManagement(user);
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
          {/* Use w-full */}
          <Tabs defaultValue="classrooms" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
              <TabsTrigger value="classrooms">Aule</TabsTrigger>
              <TabsTrigger value="users">Utenti</TabsTrigger>
              <TabsTrigger value="bookings">Prenotazioni</TabsTrigger>
            </TabsList>
            <TabsContent value="classrooms">
              <Card>
                 <CardHeader>
                     <CardTitle>Orario Aule</CardTitle>
                     <CardDescription>Assegna professori agli slot orari nelle aule disponibili.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead className="min-w-[80px] w-24 sticky left-0 bg-background z-10">Ora</TableHead>
                                     {days.map((day) => (
                                         <TableHead key={day} colSpan={classrooms.length} className="text-center border-l border-r min-w-[400px] w-96">{day}</TableHead>
                                     ))}
                                 </TableRow>
                                 <TableRow>
                                     <TableHead className="sticky left-0 bg-background z-10">Aula</TableHead>
                                     {days.map((day) =>
                                        classrooms.map((classroom) => (
                                            <TableHead key={`${day}-${classroom}`} className="min-w-[200px] w-48 border-l text-center">{classroom}</TableHead>
                                        ))
                                     )}
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                 {timeSlots.map((time) => (
                                     <TableRow key={time}>
                                         <TableCell className="font-medium sticky left-0 bg-background z-10">{time}</TableCell>
                                         {days.map((day) => {
                                            return classrooms.map((classroom) => {
                                                const scheduleKey = `${day}-${time}-${classroom}`;
                                                const assignment = schedule[scheduleKey];
                                                const assignedProfessor = assignment?.professor || '';
                                                // Determine the color based on the assigned professor
                                                const professorColorClass = getProfessorColor(assignedProfessor, professors); // Pass the list of professors
                                                return (
                                                    <TableCell
                                                        key={scheduleKey}
                                                        className={cn(
                                                            'border-l',
                                                            professorColorClass // Apply color class
                                                        )}
                                                    >
                                                        <Select
                                                            value={assignedProfessor || 'unassigned'} // Ensure value corresponds to an item or 'unassigned'
                                                            onValueChange={(value) => handleProfessorAssignmentChange(day, time, classroom, value)}
                                                        >
                                                            <SelectTrigger className="w-full">
                                                                {/* Display professor email or placeholder */}
                                                                <SelectValue placeholder="Assegna Professore">
                                                                    {assignedProfessor || "Assegna"}
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
                                            });
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
                     <CardDescription>Elenco di tutti gli studenti e professori approvati. Assegna professori agli utenti.</CardDescription>
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
                                         <TableHead>Professori Assegnati</TableHead>
                                         <TableHead>Azioni</TableHead>
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {approvedUsers.map((user) => (
                                         <TableRow key={`approved-${user.id}`}>
                                             <TableCell>{user.name}</TableCell>
                                             <TableCell>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</TableCell>
                                             <TableCell>{user.email}</TableCell>
                                             <TableCell>
                                                 {(user.assignedProfessorEmails && user.assignedProfessorEmails.length > 0)
                                                     ? user.assignedProfessorEmails.join(', ')
                                                     : 'Nessuno'}
                                             </TableCell>
                                             <TableCell>
                                                <Button
                                                    onClick={() => openManageProfessorsDialog(user)}
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    Gestisci Professori
                                                </Button>
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
            {/* Updated Bookings Tab Content */}
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
                                             <TableHead>Aula</TableHead>
                                             <TableHead>Professore</TableHead>
                                             <TableHead>Studente/Professore</TableHead>
                                             <TableHead>Ora Prenotazione</TableHead>
                                         </TableRow>
                                     </TableHeader>
                                     <TableBody>
                                         {allBookedSlots.map((slot) => (
                                             <TableRow key={`booked-${slot.id}`}>
                                                 <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                 <TableCell>{slot.time}</TableCell>
                                                 <TableCell>{slot.classroom}</TableCell>
                                                 <TableCell>{slot.professorEmail}</TableCell>
                                                 <TableCell>{slot.bookedBy}</TableCell>
                                                 <TableCell>{slot.bookingTime ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}</TableCell>
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
    {/* Dialog for Managing User Professors */}
    {selectedUserForProfessorManagement && (
        <ManageUserProfessorsDialog
            isOpen={isManageProfessorsDialogOpen}
            onClose={() => {
                setIsManageProfessorsDialogOpen(false);
                setSelectedUserForProfessorManagement(null);
            }}
            user={selectedUserForProfessorManagement}
            allProfessors={professors} // Pass the list of all approved professors
            onSave={handleSaveUserProfessors} // Use the updated save handler
        />
    )}
    </>
  );
}
