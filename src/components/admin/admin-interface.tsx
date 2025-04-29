
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
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {sendEmail} from '@/services/email';
import {useToast} from "@/hooks/use-toast";
import type { UserData } from '@/types/user';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';
import { ManageUserProfessorsDialog } from './manage-user-professors-dialog';
import { cn } from "@/lib/utils";
import type {DisplayUser} from '@/types/display-user';
import type { BookableSlot, ScheduleAssignment } from '@/types/schedule'; // Import schedule types
import type { AllUsersData, AllProfessorAvailability, ClassroomSchedule } from '@/types/app-data'; // Import app data types
import { it } from 'date-fns/locale';
import { readData, writeData } from '@/services/data-storage'; // Import data storage service

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_DATA_FILE = 'schedule';
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)

// Define available classrooms (could be moved to a config file later)
const classrooms = ['Aula 1 Grande', 'Aula 2 Piccola'];

// Define a color palette for professors
const professorColors = [
  'bg-blue-100 dark:bg-blue-900', 'bg-yellow-100 dark:bg-yellow-900', 'bg-purple-100 dark:bg-purple-900',
  'bg-pink-100 dark:bg-pink-900', 'bg-indigo-100 dark:bg-indigo-900', 'bg-teal-100 dark:bg-teal-900',
  'bg-orange-100 dark:bg-orange-900', 'bg-lime-100 dark:bg-lime-900', 'bg-cyan-100 dark:bg-cyan-900',
  'bg-emerald-100 dark:bg-emerald-900',
];

// Function to get a color class based on professor email
const getProfessorColor = (professorEmail: string, allProfessors: string[]): string => {
    const index = allProfessors.indexOf(professorEmail);
    return index === -1 ? '' : professorColors[index % professorColors.length];
};


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]);
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ClassroomSchedule>({}); // Use ClassroomSchedule type
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]);
  const [isManageProfessorsDialogOpen, setIsManageProfessorsDialogOpen] = useState(false);
  const [selectedUserForProfessorManagement, setSelectedUserForProfessorManagement] = useState<DisplayUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Loading state

  const {toast} = useToast();

   const sortSlots = (slots: BookableSlot[]) => {
      return slots.sort((a, b) => {
          if (!a?.date || !b?.date || !a?.time || !b?.time) return 0;
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.time.localeCompare(b.time);
      });
   };


  // Function to load data from files
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
      const loadedSchedule = await readData<ClassroomSchedule>(SCHEDULE_DATA_FILE, {});

      const loadedPending: DisplayUser[] = [];
      const loadedApproved: DisplayUser[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      // Process Users
      Object.entries(allUsers).forEach(([email, userData]) => {
         if (userData.role && ['student', 'professor', 'admin'].includes(userData.role) && typeof userData.approved === 'boolean') {
            const name = email.split('@')[0];
            const userDisplayData: DisplayUser = {
              id: idCounter++, name: name, role: userData.role, email: email,
              assignedProfessorEmails: Array.isArray(userData.assignedProfessorEmail) ? userData.assignedProfessorEmail : null,
            };

            if (userData.approved === true) {
               if(userData.role !== 'admin') loadedApproved.push(userDisplayData);
               if (userData.role === 'professor') loadedProfessors.push(email);
            } else {
               loadedPending.push(userDisplayData);
            }
         }
      });
      setPendingRegistrations(loadedPending);
      setApprovedUsers(loadedApproved);
      setProfessors(loadedProfessors.sort());

      // Process Booked Slots from Availability Data
       const loadedAllBooked: BookableSlot[] = [];
       Object.values(allAvailability).flat().forEach(slot => {
           if (slot && slot.id && slot.date && slot.time && slot.classroom && slot.bookedBy && slot.professorEmail && slot.duration === 60) {
              loadedAllBooked.push(slot);
           }
       });
       setAllBookedSlots(sortSlots(loadedAllBooked));

       // Set Schedule
       setSchedule(loadedSchedule);

    } catch (error) {
        console.error("Failed to load data:", error);
        toast({ variant: "destructive", title: "Errore Caricamento Dati", description: "Impossibile caricare i dati dell'applicazione." });
        // Set default empty states on error
        setPendingRegistrations([]);
        setApprovedUsers([]);
        setProfessors([]);
        setSchedule({});
        setAllBookedSlots([]);
    } finally {
       setIsLoading(false);
    }
  }, [toast]); // Add toast to dependencies

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);


  // Save schedule to file whenever it changes
  useEffect(() => {
     // Avoid saving during initial load or if schedule hasn't changed meaningfully
     if (!isLoading && Object.keys(schedule).length > 0) {
        writeData<ClassroomSchedule>(SCHEDULE_DATA_FILE, schedule).catch(err => {
            console.error("Failed to save schedule:", err);
            toast({ variant: "destructive", title: "Errore Salvataggio Orario", description: "Impossibile salvare l'orario delle aule." });
        });
     } else if (!isLoading && Object.keys(schedule).length === 0) {
        // Handle case where schedule becomes empty after being loaded
        // Check if file exists before attempting to write empty {}
        // This prevents overwriting potentially valid empty data loaded initially
        readData(SCHEDULE_DATA_FILE, {}).then(existingSchedule => {
            if (Object.keys(existingSchedule).length > 0) { // Only write if it wasn't already empty
                writeData<ClassroomSchedule>(SCHEDULE_DATA_FILE, {}).catch(err => {
                   console.error("Failed to save empty schedule:", err);
                    toast({ variant: "destructive", title: "Errore Salvataggio Orario", description: "Impossibile salvare l'orario delle aule." });
                });
            }
        }).catch(err => console.error("Error reading schedule before saving empty:", err)); // Log read error
     }
  }, [schedule, isLoading, toast]); // Include isLoading and toast

  const approveRegistration = async (email: string) => {
    setIsLoading(true); // Indicate loading state
    try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const userData = allUsers[email];

        if (userData) {
            userData.approved = true;
            userData.assignedProfessorEmail = userData.assignedProfessorEmail || null; // Ensure it's initialized

            await writeData<AllUsersData>(USERS_DATA_FILE, allUsers); // Save updated users data

            // Send approval email
            await sendEmail({
                to: email,
                subject: 'Registrazione Approvata',
                html: '<p>La tua registrazione è stata approvata. Ora puoi accedere.</p>',
            });

            toast({
                title: "Registrazione Approvata",
                description: `La registrazione per ${email} è stata approvata.`,
            });
            await loadData(); // Refresh all data after successful approval
        } else {
            toast({ variant: "destructive", title: "Errore", description: "Dati utente non trovati." });
        }
    } catch (error: any) {
        console.error("Errore durante l'approvazione per:", email, error);
        toast({
            variant: "destructive",
            title: "Errore Approvazione Registrazione",
            description: `Impossibile approvare la registrazione per ${email}. Errore: ${error.message || String(error)}`,
        });
    } finally {
       setIsLoading(false); // Reset loading state
    }
};

const rejectRegistration = async (email: string) => {
    setIsLoading(true);
    try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const registration = pendingRegistrations.find((reg) => reg.email === email); // Check pending state first

        if (registration && allUsers[email]) {
            delete allUsers[email]; // Remove user from the data object
            await writeData<AllUsersData>(USERS_DATA_FILE, allUsers); // Save the updated data

            // Send rejection email
             try {
               await sendEmail({
                 to: email,
                 subject: 'Registrazione Rifiutata',
                 html: '<p>La tua registrazione è stata rifiutata.</p>',
               });
             } catch (emailError: any) {
                console.error("Errore invio email di rifiuto:", emailError);
                 // Optionally notify admin about email failure, but proceed with rejection
                 toast({ title: "Avviso", description: `Registrazione rifiutata per ${email}, ma errore nell'invio email.` });
             }

            toast({
                title: "Registrazione Rifiutata",
                description: `La registrazione per ${email} è stata rifiutata ed eliminata.`,
            });
            await loadData(); // Refresh data
        } else {
             toast({ variant: "destructive", title: "Errore", description: "Registrazione non trovata o dati utente mancanti." });
        }
    } catch (error: any) {
        console.error("Errore durante il rifiuto della registrazione per:", email, error);
        toast({
            variant: "destructive",
            title: "Errore Rifiuto Registrazione",
            description: `Impossibile rifiutare la registrazione per ${email}. Errore: ${error.message || String(error)}`,
        });
    } finally {
        setIsLoading(false);
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
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

  const handleProfessorAssignmentChange = (day: string, time: string, classroom: string, professorEmail: string) => {
    const key = `${day}-${time}-${classroom}`;
    const newAssignment: ScheduleAssignment = {
        professor: professorEmail === 'unassigned' ? '' : professorEmail
    };
    // Update local state immediately for responsiveness
    setSchedule(prevSchedule => ({ ...prevSchedule, [key]: newAssignment }));
    // Saving is handled by the useEffect hook watching `schedule`
};


 const handleSaveUserProfessors = async (userEmail: string, assignedEmails: string[]) => {
     setIsLoading(true);
     try {
         const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
         const userData = allUsers[userEmail];

         if (userData) {
             userData.assignedProfessorEmail = assignedEmails.length > 0 ? assignedEmails : null;
             await writeData<AllUsersData>(USERS_DATA_FILE, allUsers);

             toast({
                 title: "Professori Aggiornati",
                 description: `Le assegnazioni dei professori per ${userEmail} sono state aggiornate.`,
             });
             setIsManageProfessorsDialogOpen(false);
             setSelectedUserForProfessorManagement(null);
             await loadData(); // Refresh data to show changes in the UI immediately
         } else {
             toast({ variant: "destructive", title: "Errore", description: "Dati utente non trovati." });
         }
     } catch (error: any) {
         console.error("Errore durante l'aggiornamento dei professori assegnati:", userEmail, assignedEmails, error);
         toast({
             variant: "destructive",
             title: "Errore Aggiornamento",
             description: `Impossibile aggiornare i professori assegnati. Errore: ${error.message || String(error)}`,
         });
     } finally {
         setIsLoading(false);
     }
 };

// Updated function to open the dialog for ANY user (student or professor)
const openManageProfessorsDialog = (user: DisplayUser) => {
    setSelectedUserForProfessorManagement(user);
    setIsManageProfessorsDialogOpen(true);
};

 // Display loading indicator
 if (isLoading) {
   return <div className="flex justify-center items-center h-screen"><p>Caricamento dati...</p></div>;
 }

  return (
    <>
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Amministratore</CardTitle>
          <CardDescription>Gestisci registrazioni utenti, disponibilità aule e visualizza le prenotazioni.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
                                                const professorColorClass = assignedProfessor ? getProfessorColor(assignedProfessor, professors) : '';
                                                return (
                                                    <TableCell
                                                        key={scheduleKey}
                                                        className={cn('border-l', professorColorClass)}
                                                    >
                                                        <Select
                                                            value={assignedProfessor || 'unassigned'}
                                                            onValueChange={(value) => handleProfessorAssignmentChange(day, time, classroom, value)}
                                                        >
                                                            <SelectTrigger className="w-full">
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
                                                 <Button onClick={() => approveRegistration(reg.email)} size="sm" disabled={isLoading}>Approva</Button>
                                                 <Button onClick={() => rejectRegistration(reg.email)} variant="destructive" size="sm" disabled={isLoading}>Rifiuta</Button>
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
                                                    disabled={isLoading}
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
            allProfessors={professors}
            onSave={handleSaveUserProfessors}
            isLoading={isLoading} // Pass loading state
        />
    )}
    </>
  );
}
