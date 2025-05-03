
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {sendEmail} from '@/services/email';
import {useToast} from "@/hooks/use-toast";
import {Separator} from '@/components/ui/separator';
import { format, parseISO, getDay, startOfWeek, addDays, subWeeks, addWeeks, isValid, isBefore, startOfDay } from 'date-fns'; // Added date-fns functions for week handling
import {ManageUserProfessorsDialog} from './manage-user-professors-dialog';
import {cn} from '@/lib/utils';
import type {DisplayUser} from '@/types/display-user';
import {it} from 'date-fns/locale';
import {readData, writeData, deleteData} from '@/services/data-storage';
import type { BookableSlot, ScheduleAssignment, BookingViewSlot } from '@/types/schedule'; // Use unified schedule type
import type {
  AllUsersData,
  AllProfessorAvailability,
  WeeklyScheduleData, // Use new weekly schedule type
  DailyScheduleAssignments
} from '@/types/app-data';
import {Calendar} from '@/components/ui/calendar';
import {Input} from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {logError} from '@/services/logging';
import { ChevronLeft, ChevronRight } from 'lucide-react'; // Icons for week navigation

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const WEEKLY_SCHEDULE_DATA_FILE = 'weeklySchedule'; // New file for weekly schedule data
const GUEST_IDENTIFIER = 'GUEST';

// Define available classrooms
const classrooms = ['Aula 1 Grande', 'Aula 2 Piccola'];

// Function to generate time slots (HOURLY)
function generateTimeSlots() {
  const slots = [];
  for (let hour = 7; hour <= 22; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return slots;
}

const timeSlots = generateTimeSlots();

// Define a color palette for professors
const professorColors = [
  'bg-blue-100 dark:bg-blue-900',
  'bg-purple-100 dark:bg-purple-900',
  'bg-pink-100 dark:bg-pink-900',
  'bg-indigo-100 dark:bg-indigo-900',
  'bg-teal-100 dark:bg-teal-900',
  'bg-orange-100 dark:bg-orange-900',
  'bg-lime-100 dark:bg-lime-900',
  'bg-cyan-100 dark:bg-cyan-900',
  'bg-emerald-100 dark:bg-emerald-900',
];
// Define a specific bright green color for guest slots
const guestColor = 'bg-green-400 dark:bg-green-700';

// Function to get a color class based on professor email
const getProfessorColor = (
  professorEmail: string | undefined | null,
  allProfessors: string[]
): string => {
  if (professorEmail === GUEST_IDENTIFIER) {
      return guestColor;
  }
  const index = allProfessors.indexOf(professorEmail || '');
  if (index === -1 || !professorEmail) {
    return '';
  }
  return professorColors[index % professorColors.length];
};


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]);
  const [professors, setProfessors] = useState<string[]>([]);
  const [weeklyScheduleData, setWeeklyScheduleData] = useState<WeeklyScheduleData>({});
  // REMOVED: const [currentWeekAssignments, setCurrentWeekAssignments] = useState<WeeklyScheduleData>({});
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]);
  const [isManageProfessorsDialogOpen, setIsManageProfessorsDialogOpen] = useState(false);
  const [selectedUserForProfessorManagement, setSelectedUserForProfessorManagement] = useState<DisplayUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [guestBookingDate, setGuestBookingDate] = useState<Date | undefined>(new Date());
  const [availableGuestSlots, setAvailableGuestSlots] = useState<string[]>([]);
  const [selectedGuestSlot, setSelectedGuestSlot] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [isBookingGuest, setIsBookingGuest] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));

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

  // Generate the days for the current week header
  const weekDates = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  // REMOVED: useEffect and useCallback for updateCurrentWeekAssignments

  // Load ALL data from files
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load Users
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      const loadedPending: DisplayUser[] = [];
      const loadedApproved: DisplayUser[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      Object.entries(allUsers).forEach(([email, userData]) => {
        if (userData && userData.role && typeof userData.approved === 'boolean') {
          const name = email.split('@')[0];
          const userDisplayData: DisplayUser = {
            id: idCounter++,
            name: name,
            role: userData.role,
            email: email,
            assignedProfessorEmail: userData.assignedProfessorEmail ?? undefined,
          };

          if (userData.approved === true) {
            if (userData.role !== 'admin') {
              loadedApproved.push(userDisplayData);
            }
            if (userData.role === 'professor') {
              loadedProfessors.push(email);
            }
          } else {
            loadedPending.push(userDisplayData);
          }
        }
      });

      setPendingRegistrations(loadedPending);
      setApprovedUsers(loadedApproved);
      setProfessors(loadedProfessors.sort());

      // Load All Booked Slots from availability file
      const allProfessorAvailability = await readData<AllProfessorAvailability>(
        AVAILABILITY_DATA_FILE,
        {}
      );
      const loadedAllBooked: BookableSlot[] = [];
      Object.entries(allProfessorAvailability).forEach(([professorIdentifier, slots]) => {
          (slots || []).flat().forEach((slot) => {
              if (
                slot &&
                slot.id &&
                slot.date &&
                slot.time &&
                slot.classroom &&
                slot.bookedBy &&
                slot.professorEmail &&
                slot.duration === 60
              ) {
                loadedAllBooked.push(slot);
              }
          });
      });

      setAllBookedSlots(sortSlots(loadedAllBooked));

      // Load Weekly Schedule Data
      const loadedWeeklySchedule = await readData<WeeklyScheduleData>(WEEKLY_SCHEDULE_DATA_FILE, {});
      setWeeklyScheduleData(loadedWeeklySchedule);

    } catch (error) {
      console.error('Errore durante il caricamento dei dati:', error);
      await logError(error, 'Admin Load Data');
      toast({
        variant: 'destructive',
        title: 'Errore Caricamento Dati',
        description:
          "Impossibile caricare i dati dell'applicazione. Controlla errors.log per dettagli.",
      });
      setPendingRegistrations([]);
      setApprovedUsers([]);
      setProfessors([]);
      setWeeklyScheduleData({}); // Reset weekly schedule
      setAllBookedSlots([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load all data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- User Management Functions ---
  const approveRegistration = async (email: string) => {
    setIsLoading(true);
    try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const userData = allUsers[email];

        if (userData && !userData.approved) {
            userData.approved = true;
            userData.assignedProfessorEmail = userData.assignedProfessorEmail || null;
            allUsers[email] = userData;
            await writeData(USERS_DATA_FILE, allUsers);

            try {
                await sendEmail({
                    to: email,
                    subject: 'Registrazione Approvata',
                    html: '<p>La tua registrazione è stata approvata. Ora puoi accedere.</p>',
                });
            } catch (emailError: any) {
                console.error("Errore invio email approvazione:", emailError);
                await logError(emailError, `Admin Approve Registration Email (${email})`);
                toast({
                    variant: "default",
                    title: "Avviso Email",
                    description: `Registrazione approvata, ma errore invio email a ${email}. Dettagli: ${emailError.message}`,
                    duration: 7000,
                });
            }
            await loadData(); // Refresh data after successful approval & email attempt
            toast({ title: 'Registrazione Approvata', description: `La registrazione per ${email} è stata approvata.` });
        } else if (userData && userData.approved) {
            toast({ variant: 'default', title: 'Utente Già Approvato', description: `${email} è già stato approvato.` });
        } else {
            throw new Error('Utente non trovato.');
        }
    } catch (error: any) {
        console.error("Errore durante l'approvazione per:", email, error);
        await logError(error, `Admin Approve Registration (${email})`);
        toast({
            variant: "destructive",
            title: "Errore Approvazione Registrazione",
            description: `Impossibile approvare la registrazione per ${email}. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`,
            duration: 7000,
        });
        await loadData();
    } finally {
        setIsLoading(false);
    }
  };

  const rejectRegistration = async (email: string) => {
     setIsLoading(true);
     try {
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        const registration = allUsers[email];

        if (registration && !registration.approved) {
            delete allUsers[email];
            await writeData(USERS_DATA_FILE, allUsers);

            try {
                 await sendEmail({
                    to: email,
                    subject: 'Registrazione Rifiutata',
                    html: '<p>La tua registrazione è stata rifiutata.</p>',
                });
             } catch (emailError: any) {
                 console.error("Errore invio email rifiuto:", emailError);
                 await logError(emailError, `Admin Reject Registration Email (${email})`);
                 toast({
                     variant: "default",
                     title: "Avviso Email",
                     description: `Registrazione rifiutata, ma errore invio email a ${email}. Dettagli: ${emailError.message}`,
                     duration: 7000,
                 });
             }
            await loadData();
            toast({ title: "Registrazione Rifiutata", description: `La registrazione per ${email} è stata rifiutata ed eliminata.` });
        } else if (!registration) {
            toast({ variant: "destructive", title: "Errore", description: "Registrazione non trovata." });
            await loadData();
        } else {
             toast({ variant: "default", title: "Azione Non Necessaria", description: "L'utente è già approvato." });
        }
     } catch (error: any) {
         console.error("Errore durante il rifiuto della registrazione per:", email, error);
         await logError(error, `Admin Reject Registration (${email})`);
         toast({
             variant: "destructive",
             title: "Errore Rifiuto Registrazione",
             description: `Impossibile rifiutare la registrazione per ${email}. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`,
             duration: 7000,
         });
         await loadData();
     } finally {
         setIsLoading(false);
     }
   };

  // --- Schedule Management ---
  const handleAssignmentChange = (
    dateKey: string, // 'YYYY-MM-DD'
    time: string, // 'HH:MM'
    classroom: string,
    professorIdentifier: string // Email or GUEST_IDENTIFIER
  ) => {
    const timeClassroomKey = `${time}-${classroom}`;
    const newAssignment: ScheduleAssignment = {
      professor: professorIdentifier === 'unassigned' ? '' : professorIdentifier,
    };

    // Update the main weeklyScheduleData state directly
    setWeeklyScheduleData(prev => {
      const updatedDayAssignments = { ...(prev[dateKey] || {}) };
      updatedDayAssignments[timeClassroomKey] = newAssignment;
      return { ...prev, [dateKey]: updatedDayAssignments };
    });
  };

  // Function to save the entire weekly schedule data
  const saveWeeklySchedule = async () => {
    setIsSavingSchedule(true);
    try {
      await writeData<WeeklyScheduleData>(WEEKLY_SCHEDULE_DATA_FILE, weeklyScheduleData);
      toast({title: 'Orario Settimanale Salvato', description: 'Le modifiche all\'orario sono state salvate.'});
    } catch (error: any) {
      console.error("Errore durante il salvataggio dell'orario settimanale:", error);
      await logError(error, 'Admin Save Weekly Schedule');
      toast({
        variant: 'destructive',
        title: 'Errore Salvataggio',
        description: `Impossibile salvare le modifiche all'orario. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`,
        duration: 7000,
      });
       // Optionally reload data to potentially revert UI changes
       await loadData();
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Functions for week navigation
  const goToPreviousWeek = () => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  };

  // --- User-Professor Assignment ---
  const handleSaveUserProfessors = async (userEmail: string, assignedEmails: string[]) => {
    setIsLoading(true);
    try {
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      const userData = allUsers[userEmail];

      if (userData) {
        userData.assignedProfessorEmail = assignedEmails.length > 0 ? assignedEmails : null;
        allUsers[userEmail] = userData;
        await writeData(USERS_DATA_FILE, allUsers);
        await loadData();
        toast({ title: 'Professori Aggiornati', description: `Le assegnazioni dei professori per ${userEmail} sono state aggiornate.` });
        setIsManageProfessorsDialogOpen(false);
        setSelectedUserForProfessorManagement(null);
      } else {
        throw new Error('Dati utente non trovati.');
      }
    } catch (error: any) {
      console.error("Errore durante l'aggiornamento dei professori assegnati:", userEmail, assignedEmails, error);
      await logError(error, `Admin Save User Professors (${userEmail})`);
      toast({
        variant: 'destructive',
        title: 'Errore Aggiornamento',
        description: `Impossibile aggiornare i professori assegnati. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`,
        duration: 7000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openManageProfessorsDialog = (user: DisplayUser) => {
    setSelectedUserForProfessorManagement(user);
    setIsManageProfessorsDialogOpen(true);
  };

  // --- Guest Booking ---
 const loadAvailableGuestSlots = useCallback(async () => {
    if (!guestBookingDate || !isValid(guestBookingDate)) {
      setAvailableGuestSlots([]);
      return;
    }

    try {
      const formattedDate = format(guestBookingDate, 'yyyy-MM-dd');
      const dayAssignments = weeklyScheduleData[formattedDate] || {}; // Get assignments for the specific date
      console.log(`[Admin Guest] Loading guest slots for: ${formattedDate}`);

      // Load all availability to check for existing bookings
      const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
      const guestAvailability = allAvailability[GUEST_IDENTIFIER] || [];
      console.log(`[Admin Guest] Loaded guest availability slots: ${guestAvailability.length}`);

      const potentialGuestSlots: string[] = []; // 'HH:MM-Classroom'
      Object.entries(dayAssignments).forEach(([timeClassroomKey, assignment]) => {
        if (assignment.professor === GUEST_IDENTIFIER) {
          const [time, ...classroomParts] = timeClassroomKey.split('-'); // Handle potential hyphens in classroom name
          const classroom = classroomParts.join('-');
          const slotId = `${formattedDate}-${time}-${classroom}-${GUEST_IDENTIFIER}`;
          // Find if the slot exists in guestAvailability AND is booked
           const isBooked = guestAvailability.some(slot => slot?.id === slotId && slot.bookedBy);
          console.log(`[Admin Guest] Checking slot ${slotId}, booked: ${isBooked}`);
          if (!isBooked) {
             // Check if the slot is in the future
             try {
                const slotDateTime = parseISO(`${formattedDate}T${time}:00`);
                if (isValid(slotDateTime) && !isBefore(slotDateTime, startOfDay(new Date()))) {
                     potentialGuestSlots.push(timeClassroomKey);
                } else {
                    console.log(`[Admin Guest] Slot ${slotId} is in the past or invalid, excluding.`);
                }
             } catch (e) {
                 console.warn(`[Admin Guest] Error parsing date/time for ${slotId}`, e);
                 logError(e, `Admin Load Guest Slots Parse (${slotId})`);
             }
          }
        }
      });

      potentialGuestSlots.sort((a, b) => {
        const [timeA, ...classroomPartsA] = a.split('-');
        const classroomA = classroomPartsA.join('-');
        const [timeB, ...classroomPartsB] = b.split('-');
        const classroomB = classroomPartsB.join('-');
        const timeCompare = timeA.localeCompare(timeB);
        if (timeCompare !== 0) return timeCompare;
        return classroomA.localeCompare(classroomB);
      });

      console.log(`[Admin Guest] Final available (unbooked, future) guest slots for ${formattedDate}:`, potentialGuestSlots);
      setAvailableGuestSlots(potentialGuestSlots);
    } catch (error: any) {
      console.error('Errore caricamento slot ospite:', error);
      await logError(error, 'Admin Load Guest Slots');
      toast({
        variant: 'destructive',
        title: 'Errore Caricamento Slot Ospite',
        description: `Impossibile caricare gli slot disponibili per gli ospiti. Errore: ${error.message || 'Errore sconosciuto'}`,
        duration: 7000,
      });
      setAvailableGuestSlots([]);
    }
  }, [guestBookingDate, weeklyScheduleData, toast]);

  // Load guest slots when the date changes or weekly schedule updates
  useEffect(() => {
    loadAvailableGuestSlots();
  }, [loadAvailableGuestSlots]);

  const handleGuestBooking = async () => {
    if (!selectedGuestSlot || !guestName.trim() || !guestBookingDate || !isValid(guestBookingDate)) {
      toast({ variant: 'destructive', title: 'Dati Mancanti', description: "Seleziona una data valida, uno slot e inserisci il nome dell'ospite." });
      return;
    }

    setIsBookingGuest(true);
    try {
      const [time, ...classroomParts] = selectedGuestSlot.split('-');
      const classroom = classroomParts.join('-');
      const formattedDate = format(guestBookingDate, 'yyyy-MM-dd');
      const dayOfWeekString = format(guestBookingDate, 'EEEE', { locale: it }); // Get Italian day name
      const slotId = `${formattedDate}-${time}-${classroom}-${GUEST_IDENTIFIER}`;

      const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
      if (!allAvailability[GUEST_IDENTIFIER]) {
        allAvailability[GUEST_IDENTIFIER] = [];
      }
      const existingBooking = allAvailability[GUEST_IDENTIFIER].find(slot => slot?.id === slotId && slot.bookedBy);
      if (existingBooking) {
        throw new Error('Questo slot è stato appena prenotato.');
      }

      const newBooking: BookableSlot = {
        id: slotId, date: formattedDate, day: dayOfWeekString, time: time, classroom: classroom, duration: 60,
        isAvailable: false, // Guest slots availability is implicit
        bookedBy: `Ospite: ${guestName.trim()}`, bookingTime: new Date().toISOString(), professorEmail: GUEST_IDENTIFIER,
      };

      allAvailability[GUEST_IDENTIFIER].push(newBooking); // Add the new booking
      await writeData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, allAvailability);

      toast({ title: 'Prenotazione Ospite Riuscita', description: `Slot ${time} in ${classroom} prenotato per ${guestName.trim()} il ${format(guestBookingDate, 'dd/MM/yyyy', { locale: it })}.` });
      setGuestName('');
      setSelectedGuestSlot(null);
      await loadAvailableGuestSlots();
      await loadData(); // Refresh main booked slots list
    } catch (error: any) {
      console.error('Errore durante la prenotazione ospite:', error);
      await logError(error, 'Admin Guest Booking');
      toast({ variant: 'destructive', title: 'Errore Prenotazione Ospite', description: error.message || 'Impossibile completare la prenotazione ospite.', duration: 7000 });
    } finally {
      setIsBookingGuest(false);
    }
  };

  // --- Render Logic ---

  return (
    <>
      <div className="flex flex-col gap-4 p-4 w-full">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Interfaccia Amministratore</CardTitle>
            <CardDescription>Gestisci orari settimanali, utenti e prenotazioni.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Tabs defaultValue="schedule-management" className="w-full">
              <TabsList className="grid w-full grid-cols-1 sm:grid-cols-4">
                <TabsTrigger value="schedule-management" disabled={isLoading}>Gestione Orario Settimanale</TabsTrigger>
                <TabsTrigger value="guest-booking" disabled={isLoading}>Prenotazione Singola</TabsTrigger>
                <TabsTrigger value="users" disabled={isLoading}>Utenti</TabsTrigger>
                <TabsTrigger value="bookings" disabled={isLoading}>Tutte le Prenotazioni</TabsTrigger>
              </TabsList>

              {/* Tab: Gestione Orario Settimanale */}
              <TabsContent value="schedule-management">
                <Card>
                  <CardHeader>
                    <CardTitle>Orario Settimanale</CardTitle>
                    <CardDescription>Assegna professori o ospiti agli slot per la settimana selezionata.</CardDescription>
                    <div className="flex justify-between items-center pt-4">
                       <Button onClick={goToPreviousWeek} disabled={isLoading || isSavingSchedule} variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
                       <span className="text-lg font-semibold">
                           Settimana del {format(currentWeekStart, 'dd MMM yyyy', { locale: it })} - {format(addDays(currentWeekStart, 6), 'dd MMM yyyy', { locale: it })}
                       </span>
                       <Button onClick={goToNextWeek} disabled={isLoading || isSavingSchedule} variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[80px] w-24 sticky left-0 bg-card z-10">Ora</TableHead>
                            {weekDates.map((date) => (
                              <TableHead key={format(date, 'yyyy-MM-dd')} colSpan={classrooms.length} className="text-center border-l border-r min-w-[200px] sm:min-w-[300px] md:min-w-[400px]">
                                {format(date, 'EEEE dd MMM', { locale: it })}
                              </TableHead>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableHead className="sticky left-0 bg-card z-10">Aula</TableHead>
                            {weekDates.map((date) =>
                              classrooms.map((classroom) => (
                                <TableHead key={`${format(date, 'yyyy-MM-dd')}-${classroom}`} className="min-w-[100px] sm:min-w-[150px] md:min-w-[200px] border-l text-center">
                                  {classroom}
                                </TableHead>
                              ))
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {timeSlots.map((time) => (
                            <TableRow key={time}>
                              <TableCell className="font-medium sticky left-0 bg-card z-10">{time}</TableCell>
                              {weekDates.map((date) => {
                                const dateKey = format(date, 'yyyy-MM-dd');
                                // Get assignments directly from weeklyScheduleData for the current view
                                const dayAssignments = weeklyScheduleData[dateKey] || {};
                                return classrooms.map((classroom) => {
                                  const timeClassroomKey = `${time}-${classroom}`;
                                  const assignment = dayAssignments[timeClassroomKey];
                                  const assignedProfessor = assignment?.professor || '';
                                  const professorColorClass = getProfessorColor(assignedProfessor, professors);

                                  return (
                                    <TableCell key={`${dateKey}-${time}-${classroom}`} className={cn('border-l', professorColorClass)}>
                                      <Select
                                        value={assignedProfessor || 'unassigned'}
                                        onValueChange={(value) => handleAssignmentChange(dateKey, time, classroom, value)}
                                        disabled={isLoading || isSavingSchedule}
                                      >
                                        <SelectTrigger className="w-full text-xs sm:text-sm">
                                          <SelectValue placeholder="Assegna">
                                            {assignedProfessor === GUEST_IDENTIFIER ? 'Ospite' : (assignedProfessor || 'Assegna')}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="unassigned">Non Assegnato</SelectItem>
                                          <SelectItem value={GUEST_IDENTIFIER}>Ospite (Prenotazione Singola)</SelectItem>
                                          {professors.map((profEmail) => (
                                            <SelectItem key={profEmail} value={profEmail}>{profEmail}</SelectItem>
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
                    <div className="flex justify-end pt-4">
                      <Button onClick={saveWeeklySchedule} disabled={isLoading || isSavingSchedule}>
                        {isSavingSchedule ? 'Salvataggio Orario...' : 'Salva Modifiche Settimana'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Prenotazione Singola (Guest Booking) */}
              <TabsContent value="guest-booking">
                <Card>
                  <CardHeader>
                    <CardTitle>Prenotazione Singola Ospite</CardTitle>
                    <CardDescription>
                      Prenota un singolo slot per un ospite esterno negli orari
                      dedicati (marcati come 'Ospite').
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-6">
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={guestBookingDate}
                        onSelect={setGuestBookingDate}
                        className="rounded-md border"
                        locale={it}
                        disabled={(date) => !date || isBefore(date, startOfDay(new Date())) || isLoading} // Disable past dates
                      />
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold">
                        Slot Ospite Disponibili per{' '}
                        {guestBookingDate && isValid(guestBookingDate)
                          ? format(guestBookingDate, 'dd/MM/yyyy', {locale: it})
                          : 'Seleziona data'}
                      </h4>
                      {isLoading ? (
                        <p>Caricamento slot...</p>
                      ) : !guestBookingDate || !isValid(guestBookingDate)? (
                        <p className="text-muted-foreground">Seleziona una data valida dal calendario.</p>
                        ) : availableGuestSlots.length === 0 ? (
                        <p className="text-muted-foreground">
                          Nessuno slot 'Ospite' disponibile o non prenotato per questa data
                          secondo l'orario settimanale.
                        </p>
                      ) : (
                        <Select
                          onValueChange={setSelectedGuestSlot}
                          value={selectedGuestSlot ?? ''}
                          disabled={isBookingGuest || isLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona uno slot" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableGuestSlots.map((slotKey) => {
                               const [time, ...classroomParts] = slotKey.split('-');
                               const classroom = classroomParts.join('-');
                               return (
                                <SelectItem key={slotKey} value={slotKey}>
                                    {`${time} - ${classroom}`}
                                </SelectItem>
                               )
                            })}
                          </SelectContent>
                        </Select>
                      )}

                      <Input
                        type="text"
                        placeholder="Nome Ospite"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        disabled={!selectedGuestSlot || isBookingGuest || isLoading}
                      />
                      <Button
                        onClick={handleGuestBooking}
                        disabled={
                          !selectedGuestSlot ||
                          !guestName.trim() ||
                          isBookingGuest ||
                          isLoading
                        }
                      >
                        {isBookingGuest ? 'Prenotazione...' : 'Prenota Slot Ospite'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Users */}
               <TabsContent value="users">
                 <Card>
                   <CardHeader>
                     <CardTitle>Registrazioni in Sospeso</CardTitle>
                     <CardDescription>Approva o rifiuta nuove registrazioni utente.</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <div className="overflow-x-auto">
                       {isLoading ? ( <p>Caricamento...</p> ) : pendingRegistrations.length > 0 ? (
                         <Table>
                           <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Ruolo</TableHead><TableHead>Email</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader>
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
                       ) : ( <p>Nessuna registrazione in sospeso.</p> )}
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
                       {isLoading ? ( <p>Caricamento...</p> ) : approvedUsers.length > 0 ? (
                         <Table>
                           <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Ruolo</TableHead><TableHead>Email</TableHead><TableHead>Professori Assegnati</TableHead><TableHead>Azioni</TableHead></TableRow></TableHeader>
                           <TableBody>
                             {approvedUsers.map((user) => (
                               <TableRow key={`approved-${user.id}`}>
                                 <TableCell>{user.name}</TableCell>
                                 <TableCell>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</TableCell>
                                 <TableCell>{user.email}</TableCell>
                                 <TableCell>{(user.assignedProfessorEmail && user.assignedProfessorEmail.length > 0) ? user.assignedProfessorEmail.join(', ') : 'Nessuno'}</TableCell>
                                 <TableCell>
                                   <Button onClick={() => openManageProfessorsDialog(user)} size="sm" variant="outline" disabled={isLoading}>Gestisci Professori</Button>
                                 </TableCell>
                               </TableRow>
                             ))}
                           </TableBody>
                         </Table>
                       ) : ( <p>Nessun utente approvato trovato.</p> )}
                     </div>
                   </CardContent>
                 </Card>
               </TabsContent>

              {/* Tab: Bookings */}
               <TabsContent value="bookings">
                 <Card>
                   <CardHeader>
                     <CardTitle>Tutte le Lezioni Prenotate</CardTitle>
                     <CardDescription>Elenco di tutte le lezioni prenotate nel sistema, ordinate per data.</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <div className="overflow-x-auto">
                       {isLoading ? ( <p>Caricamento...</p> ) : allBookedSlots.length > 0 ? (
                         <Table>
                           <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead>Studente/Prof./Ospite</TableHead><TableHead>Ora Prenotazione</TableHead></TableRow></TableHeader>
                           <TableBody>
                             {allBookedSlots.map((slot) => (
                               <TableRow key={`booked-${slot.id}`}>
                                 <TableCell>{slot.date && isValid(parseISO(slot.date)) ? format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it }) : 'Data non valida'}</TableCell>
                                 <TableCell>{slot.time}</TableCell>
                                 <TableCell>{slot.classroom}</TableCell>
                                 <TableCell>{slot.professorEmail === GUEST_IDENTIFIER ? 'Ospite' : slot.professorEmail}</TableCell>
                                 <TableCell>{slot.bookedBy}</TableCell>
                                 <TableCell>{slot.bookingTime && isValid(parseISO(slot.bookingTime)) ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}</TableCell>
                               </TableRow>
                             ))}
                           </TableBody>
                         </Table>
                       ) : ( <p>Nessuna lezione prenotata al momento.</p> )}
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
          onClose={() => { setIsManageProfessorsDialogOpen(false); setSelectedUserForProfessorManagement(null); }}
          user={selectedUserForProfessorManagement}
          allProfessors={professors}
          onSave={handleSaveUserProfessors}
          isLoading={isLoading}
        />
      )}
    </>
  );
}

