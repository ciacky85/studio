
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {sendEmail} from '@/services/email';
import {useToast} from "@/hooks/use-toast";
import type {UserData} from '@/types/user';
import type {AllUsersData} from '@/types/app-data';
import {Separator} from '@/components/ui/separator';
import { format, parseISO, getDay, isWithinInterval, parse, isBefore, startOfDay, isValid } from 'date-fns'; // Added isValid
import {ManageUserProfessorsDialog} from './manage-user-professors-dialog';
import {cn} from '@/lib/utils';
import type {DisplayUser} from '@/types/display-user';
import {it} from 'date-fns/locale';
import {readData, writeData, deleteData} from '@/services/data-storage';
import type {
  BookableSlot,
  ScheduleAssignment,
  BookingViewSlot,
} from '@/types/schedule';
import type {
  AllProfessorAvailability,
  ClassroomSchedule,
} from '@/types/app-data';
import type {
  ScheduleConfiguration,
  AllScheduleConfigurations,
} from '@/types/schedule-configuration';
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
import {logError} from '@/services/logging'; // Import logging service

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability'; // Renamed for clarity
const SCHEDULE_CONFIGURATIONS_FILE = 'scheduleConfigurations'; // New file for configurations
const GUEST_IDENTIFIER = 'GUEST'; // Constant for guest identifier

// Define available classrooms
const classrooms = ['Aula 1 Grande', 'Aula 2 Piccola'];

// Helper function to find relevant configurations for a given date
export const findRelevantConfigurations = (
  date: Date | undefined, // Allow undefined date
  allConfigs: ScheduleConfiguration[]
): ScheduleConfiguration[] => {
  // Return empty array if date is invalid or configs are missing
   if (!date || !isValid(date) || !allConfigs || allConfigs.length === 0) {
    return [];
  }
  const targetDateStart = startOfDay(date); // Ensure comparison is at the start of the day
  return allConfigs.filter((config) => {
    try {
      const startDate = parseISO(config.startDate);
      const endDate = parseISO(config.endDate);
       if (!isValid(startDate) || !isValid(endDate)) return false;
      // Use startOfDay for comparison to ensure inclusivity
      return isWithinInterval(targetDateStart, {start: startOfDay(startDate), end: startOfDay(endDate)});
    } catch (e) {
      console.error(
        `Error parsing dates for configuration ${config.id} (${config.name}):`,
        e
      );
      return false;
    }
  });
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
const days = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
]; // Italian days

// Define a color palette for professors
const professorColors = [
  'bg-blue-100 dark:bg-blue-900',
  'bg-green-100 dark:bg-green-900',
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
const guestColor = 'bg-green-400 dark:bg-green-700'; // Example: Bright green

// Function to get a color class based on professor email
const getProfessorColor = (
  professorEmail: string | undefined | null,
  allProfessors: string[]
): string => {
  const index = allProfessors.indexOf(professorEmail || ''); // Handle null/undefined
  // Return empty string if not found, unassigned, null, or the GUEST identifier
  if (index === -1 || !professorEmail || professorEmail === GUEST_IDENTIFIER) {
    return '';
  }
  return professorColors[index % professorColors.length];
};

export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<
    DisplayUser[]
  >([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]);
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ClassroomSchedule>({});
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]);
  const [
    isManageProfessorsDialogOpen,
    setIsManageProfessorsDialogOpen,
  ] = useState(false);
  const [
    selectedUserForProfessorManagement,
    setSelectedUserForProfessorManagement,
  ] = useState<DisplayUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configName, setConfigName] = useState('');
  const [configStartDate, setConfigStartDate] = useState<Date | undefined>(
    undefined
  );
  const [configEndDate, setConfigEndDate] = useState<Date | undefined>(
    undefined
  );
  const [
    savedConfigurations,
    setSavedConfigurations,
  ] = useState<ScheduleConfiguration[]>([]);
  const [
    showReplaceConfirmDialog,
    setShowReplaceConfirmDialog,
  ] = useState(false);
  const [
    configToReplace,
    setConfigToReplace,
  ] = useState<ScheduleConfiguration | null>(null);
  const [isDeletingConfig, setIsDeletingConfig] = useState(false); // Added state for delete loading
  const [
    configToDelete,
    setConfigToDelete,
  ] = useState<ScheduleConfiguration | null>(null); // Added state for delete confirmation
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [guestBookingDate, setGuestBookingDate] = useState<Date | undefined>(
    new Date()
  );
  const [availableGuestSlots, setAvailableGuestSlots] = useState<string[]>([]); // "HH:MM-Classroom" format
  const [selectedGuestSlot, setSelectedGuestSlot] = useState<string | null>(
    null
  );
  const [guestName, setGuestName] = useState('');
  const [isBookingGuest, setIsBookingGuest] = useState(false);

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
            assignedProfessorEmails:
              userData.assignedProfessorEmail ?? undefined, // Use correct field name
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
                slot.professorEmail && // professorEmail field still exists on the slot itself
                slot.duration === 60
              ) {
                loadedAllBooked.push(slot);
              }
          });
      });

      setAllBookedSlots(sortSlots(loadedAllBooked));

      // Load Saved Schedule Configurations
      const loadedConfigs = await readData<AllScheduleConfigurations>(
        SCHEDULE_CONFIGURATIONS_FILE,
        []
      );
      setSavedConfigurations(loadedConfigs);
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
      setSchedule({});
      setAllBookedSlots([]);
      setSavedConfigurations([]);
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
            // Ensure assignedProfessorEmail is initialized or kept
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
                    duration: 7000, // Show longer
                });
            }

            await loadData(); // Refresh data after successful approval & email attempt

            toast({
                title: 'Registrazione Approvata',
                description: `La registrazione per ${email} è stata approvata.`,
            });
        } else if (userData && userData.approved) {
            toast({
                variant: 'default',
                title: 'Utente Già Approvato',
                description: `${email} è già stato approvato.`,
            });
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
        // Optionally reload data on critical error to ensure UI consistency
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

            // Send rejection email (best effort)
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

            await loadData(); // Refresh data after successful rejection & email attempt

            toast({
                title: "Registrazione Rifiutata",
                description: `La registrazione per ${email} è stata rifiutata ed eliminata.`,
            });
        } else if (!registration) {
            toast({
                variant: "destructive",
                title: "Errore",
                description: "Registrazione non trovata.",
            });
            await loadData(); // Refresh UI
        } else { // User exists but is already approved
             toast({
                variant: "default",
                title: "Azione Non Necessaria",
                description: "L'utente è già approvato.",
            });
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
          // Optionally reload data on critical error
          await loadData();
     } finally {
         setIsLoading(false);
     }
   };

  // --- Schedule Configuration Management ---

  const handleProfessorAssignmentChange = (
    day: string,
    time: string,
    classroom: string,
    professorIdentifier: string // Can be email or GUEST_IDENTIFIER
  ) => {
    const key = `${day}-${time}-${classroom}`;
    const newAssignment: ScheduleAssignment = {
      professor: professorIdentifier === 'unassigned' ? '' : professorIdentifier,
    };
    setSchedule((prevSchedule) => ({...prevSchedule, [key]: newAssignment}));
  };

  const resetScheduleConfiguration = () => {
    setSchedule({});
    setConfigName('');
    setConfigStartDate(undefined);
    setConfigEndDate(undefined);
    toast({title: 'Tabella Orario Resettata'});
  };

   const saveScheduleConfiguration = async (
     replaceExisting: boolean = false,
     existingConfigId?: string
   ) => {
     // --- Initial Validation ---
     if (!configName) {
       toast({ variant: 'destructive', title: 'Dati Mancanti', description: 'Inserisci un nome per la configurazione.' });
       return;
     }
     if (!configStartDate || !isValid(configStartDate)) {
        toast({ variant: 'destructive', title: 'Data Inizio Non Valida', description: 'Seleziona una data di inizio valida.' });
        return;
     }
      if (!configEndDate || !isValid(configEndDate)) {
          toast({ variant: 'destructive', title: 'Data Fine Non Valida', description: 'Seleziona una data di fine valida.' });
          return;
      }
      if (isBefore(configEndDate, configStartDate)) {
         toast({ variant: 'destructive', title: 'Date Non Valide', description: 'La data di fine non può precedere la data di inizio.' });
         return;
      }
     if (Object.keys(schedule).length === 0) {
       toast({ variant: 'destructive', title: 'Orario Vuoto', description: 'Assegna almeno uno slot orario prima di salvare.' });
       return;
     }

     // --- Check for Existing Configuration (if not explicitly replacing via dialog) ---
     if (!replaceExisting) {
       const existingConfigByName = savedConfigurations.find(cfg => cfg.name === configName);
       if (existingConfigByName) {
         console.log('[Admin] Existing config found by name, showing replace dialog for:', existingConfigByName.name);
         setConfigToReplace(existingConfigByName);
         setShowReplaceConfirmDialog(true);
         // Don't set isSavingConfig yet, wait for dialog
         return; // Exit function, wait for dialog confirmation
       }
     }

     // --- Proceed with Saving/Replacing ---
     setIsSavingConfig(true); // Set loading state *before* async operations
     try {
       const newConfig: ScheduleConfiguration = {
         id: replaceExisting && existingConfigId ? existingConfigId : Date.now().toString(),
         name: configName,
         startDate: format(configStartDate, 'yyyy-MM-dd'),
         endDate: format(configEndDate, 'yyyy-MM-dd'),
         schedule: schedule,
       };

       let updatedConfigs: ScheduleConfiguration[];
       if (replaceExisting && existingConfigId) { // Ensure ID exists when replacing
           console.log(`[Admin] Replacing configuration with ID: ${existingConfigId}`);
           updatedConfigs = savedConfigurations.map((cfg) =>
             cfg.id === existingConfigId ? newConfig : cfg // Use existingConfigId from parameter
           );
           setConfigToReplace(null); // Reset replacement target after successful preparation
       } else {
           console.log(`[Admin] Adding new configuration: ${newConfig.name}`);
           updatedConfigs = [...savedConfigurations, newConfig];
       }

       // Write data to file
       console.log('[Admin] Writing configurations to file...');
       await writeData<AllScheduleConfigurations>(
         SCHEDULE_CONFIGURATIONS_FILE,
         updatedConfigs
       );
       console.log('[Admin] Configurations successfully written.');

       // Update state and reset form
       setSavedConfigurations(updatedConfigs);
       resetScheduleConfiguration(); // Clear the form AFTER successful save

       toast({
         title: 'Configurazione Salvata',
         description: `La configurazione "${newConfig.name}" è stata ${replaceExisting ? 'aggiornata' : 'salvata'} con successo.`,
       });

     } catch (error: any) {
       console.error('Errore durante il salvataggio della configurazione:', error);
       await logError(error, 'Admin Save Schedule Configuration');
       toast({
         variant: 'destructive',
         title: 'Errore Salvataggio',
         description: `Impossibile salvare la configurazione. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`,
         duration: 7000,
       });
     } finally {
       // Ensure state is reset regardless of success or failure
       setIsSavingConfig(false);
       setShowReplaceConfirmDialog(false); // Close dialog if it was open
       // Don't reset configToReplace here, it's reset inside the replace logic or on dialog cancel
     }
   };

    // Handler for the confirmation dialog's "Replace" action
    const handleReplaceConfirm = () => {
      if (configToReplace) {
        console.log('[Admin] Confirmed replacement for:', configToReplace.name);
        // Pass the ID of the config to be replaced
        saveScheduleConfiguration(true, configToReplace.id);
      } else {
        console.error('[Admin] Replace confirmed but configToReplace is null!');
      }
      setShowReplaceConfirmDialog(false); // Close dialog
    };


  const loadConfiguration = (configId: string) => {
    const configToLoad = savedConfigurations.find((cfg) => cfg.id === configId);
    if (configToLoad) {
      setSchedule(configToLoad.schedule);
      setConfigName(configToLoad.name);
      try {
        const startDate = parseISO(configToLoad.startDate);
        const endDate = parseISO(configToLoad.endDate);
         if (!isValid(startDate) || !isValid(endDate)) {
            throw new Error("Date configuration non valide");
         }
        setConfigStartDate(startDate);
        setConfigEndDate(endDate);
      } catch (e: any) {
        console.error('Error parsing dates from loaded config:', e);
        await logError(e, `Admin Load Configuration Dates (${configId})`);
        setConfigStartDate(undefined);
        setConfigEndDate(undefined);
         toast({ variant: "destructive", title: "Errore Caricamento Date", description: "Date nella configurazione non valide." });
      }
      toast({title: 'Configurazione Caricata', description: `Configurazione "${configToLoad.name}" caricata nella tabella.`});
    }
  };

  // --- Delete Configuration ---
  const openDeleteConfirmation = (config: ScheduleConfiguration) => {
    setConfigToDelete(config);
    setShowDeleteConfirmDialog(true);
  };

  const deleteConfiguration = async () => {
    if (!configToDelete) return;

    setIsDeletingConfig(true);
    try {
      const updatedConfigs = savedConfigurations.filter(
        (cfg) => cfg.id !== configToDelete.id
      );
      await writeData<AllScheduleConfigurations>(
        SCHEDULE_CONFIGURATIONS_FILE,
        updatedConfigs
      );
      setSavedConfigurations(updatedConfigs);
      toast({title: 'Configurazione Eliminata', description: `Configurazione "${configToDelete.name}" eliminata.`});
    } catch (error: any) {
      console.error('Errore eliminazione configurazione:', error);
      await logError(error, 'Admin Delete Configuration');
      toast({variant: 'destructive', title: 'Errore Eliminazione', description: `Impossibile eliminare la configurazione. Errore: ${error.message || 'Errore sconosciuto'}. Controlla errors.log.`, duration: 7000});
    } finally {
      setIsDeletingConfig(false);
      setConfigToDelete(null);
      setShowDeleteConfirmDialog(false);
    }
  };

  // --- User-Professor Assignment ---

  const handleSaveUserProfessors = async (
    userEmail: string,
    assignedEmails: string[]
  ) => {
    setIsLoading(true); // Indicate saving assignment
    try {
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      const userData = allUsers[userEmail];

      if (userData) {
        userData.assignedProfessorEmail =
          assignedEmails.length > 0 ? assignedEmails : null; // Use correct field

        allUsers[userEmail] = userData;
        await writeData(USERS_DATA_FILE, allUsers);

        await loadData(); // Refresh UI data

        toast({
          title: 'Professori Aggiornati',
          description: `Le assegnazioni dei professori per ${userEmail} sono state aggiornate.`,
        });
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
      setIsLoading(false); // Finish loading indicator
    }
  };

  const openManageProfessorsDialog = (user: DisplayUser) => {
    setSelectedUserForProfessorManagement(user);
    setIsManageProfessorsDialogOpen(true);
  };

  // --- Guest Booking Logic ---

 const loadAvailableGuestSlots = useCallback(async () => {
    if (!guestBookingDate || !isValid(guestBookingDate)) {
      setAvailableGuestSlots([]);
      return;
    }

    try {
      const formattedDate = format(guestBookingDate, 'yyyy-MM-dd');
      const dayIndex = getDay(guestBookingDate);
      // Correct mapping: Sunday (0) -> index 6, Monday (1) -> index 0, etc.
      const adjustedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
      const dayOfWeekString = days[adjustedDayIndex];

      console.log(`[Admin Guest] Loading guest slots for: ${formattedDate} (Day index: ${dayIndex}, Mapped day: ${dayOfWeekString})`);

      const relevantConfigs = findRelevantConfigurations(
        guestBookingDate,
        savedConfigurations
      );

      if (relevantConfigs.length === 0) {
         console.log(`[Admin Guest] Nessuna configurazione valida trovata per ${formattedDate}`);
        setAvailableGuestSlots([]);
        return;
      }
       console.log(`[Admin Guest] Config trovate per ${formattedDate}: ${relevantConfigs.map(c => c.name).join(', ')}`);

      // Load all availability to check for existing bookings
      const allAvailability = await readData<AllProfessorAvailability>(
        AVAILABILITY_DATA_FILE,
        {}
      );
      // Get availability using the GUEST_IDENTIFIER
      const guestAvailability = allAvailability[GUEST_IDENTIFIER] || [];
      console.log(`[Admin Guest] Loaded guest availability slots: ${guestAvailability.length}`);


      const potentialGuestAssignments = new Set<string>(); // 'HH:MM-Classroom'

      relevantConfigs.forEach((config) => {
        console.log(`[Admin Guest] Checking config: ${config.name}`);
        Object.entries(config.schedule).forEach(([key, assignment]) => {
          const parts = key.split('-');
          if (parts.length >= 3) {
            const day = parts[0];
            const time = parts[1];
            const classroom = parts.slice(2).join('-');

            // Strict check: day matches AND professor is GUEST_IDENTIFIER
            if (
              day === dayOfWeekString &&
              assignment.professor === GUEST_IDENTIFIER &&
              time &&
              classroom
            ) {
              potentialGuestAssignments.add(`${time}-${classroom}`);
            }
          }
        });
      });

       console.log(`[Admin Guest] Potential guest slots from configs for ${formattedDate} (${dayOfWeekString}):`, Array.from(potentialGuestAssignments));


      const finalAvailableSlots: string[] = [];
      potentialGuestAssignments.forEach((timeClassroomKey) => {
        const [time, classroom] = timeClassroomKey.split('-');
        // Construct potential ID using GUEST_IDENTIFIER
        const slotId = `${formattedDate}-${time}-${classroom}-${GUEST_IDENTIFIER}`;

        // Check if this specific slot ID is already booked in the main availability file under GUEST_IDENTIFIER
        const isBooked = guestAvailability.some(
            (slot) => slot?.id === slotId && slot.bookedBy
        );

        if (!isBooked) {
          finalAvailableSlots.push(timeClassroomKey); // Add "HH:MM-Classroom"
        } else {
            console.log(`[Admin Guest] Slot ${slotId} is already booked.`);
        }
      });

      finalAvailableSlots.sort((a, b) => {
        const [timeA, classroomA] = a.split('-');
        const [timeB, classroomB] = b.split('-');
        const timeCompare = timeA.localeCompare(timeB);
        if (timeCompare !== 0) return timeCompare;
        return classroomA.localeCompare(classroomB);
      });

       console.log(`[Admin Guest] Final available (unbooked) guest slots for ${formattedDate}:`, finalAvailableSlots);
      setAvailableGuestSlots(finalAvailableSlots);
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
  }, [guestBookingDate, savedConfigurations, toast]); // Added dependencies


  // Load guest slots when the date changes
  useEffect(() => {
    loadAvailableGuestSlots();
  }, [loadAvailableGuestSlots]);

  const handleGuestBooking = async () => {
    if (!selectedGuestSlot || !guestName.trim() || !guestBookingDate || !isValid(guestBookingDate)) {
      toast({
        variant: 'destructive',
        title: 'Dati Mancanti',
        description: "Seleziona una data valida, uno slot e inserisci il nome dell'ospite.",
      });
      return;
    }

    setIsBookingGuest(true);
    try {
      const [time, classroom] = selectedGuestSlot.split('-');
      const formattedDate = format(guestBookingDate, 'yyyy-MM-dd');
      const dayOfWeekIndex = getDay(guestBookingDate);
       // Correct mapping: Sunday (0) -> index 6, Monday (1) -> index 0, etc.
       const adjustedDayIndex = dayOfWeekIndex === 0 ? 6 : dayOfWeekIndex - 1;
       const dayOfWeekString = days[adjustedDayIndex];
      // Use GUEST_IDENTIFIER for the slot ID
      const slotId = `${formattedDate}-${time}-${classroom}-${GUEST_IDENTIFIER}`;

      const allAvailability = await readData<AllProfessorAvailability>(
        AVAILABILITY_DATA_FILE,
        {}
      );

      // Ensure GUEST_IDENTIFIER array exists
      if (!allAvailability[GUEST_IDENTIFIER]) {
        allAvailability[GUEST_IDENTIFIER] = [];
      }

      const existingBooking = allAvailability[GUEST_IDENTIFIER].find(
        (slot) => slot?.id === slotId && slot.bookedBy
      );
      if (existingBooking) {
        throw new Error('Questo slot è stato appena prenotato da qualcun altro.');
      }

      const newBooking: BookableSlot = {
        id: slotId,
        date: formattedDate,
        day: dayOfWeekString,
        time: time,
        classroom: classroom,
        duration: 60,
        isAvailable: false, // Mark as unavailable since it's booked
        bookedBy: `Ospite: ${guestName.trim()}`,
        bookingTime: new Date().toISOString(),
        professorEmail: GUEST_IDENTIFIER, // Use GUEST_IDENTIFIER
      };

      const existingSlotIndex = allAvailability[GUEST_IDENTIFIER].findIndex(
        (slot) => slot?.id === slotId
      );
      if (existingSlotIndex > -1) {
        allAvailability[GUEST_IDENTIFIER][existingSlotIndex] = newBooking;
      } else {
        allAvailability[GUEST_IDENTIFIER].push(newBooking);
      }

      await writeData<AllProfessorAvailability>(
        AVAILABILITY_DATA_FILE,
        allAvailability
      );

      toast({
        title: 'Prenotazione Ospite Riuscita',
        description: `Slot ${time} in ${classroom} prenotato per ${guestName.trim()} il ${format(guestBookingDate, 'dd/MM/yyyy', { locale: it })}.`,
      });
      setGuestName('');
      setSelectedGuestSlot(null);
      await loadAvailableGuestSlots();
      await loadData(); // Refresh main booked slots list
    } catch (error: any) {
      console.error('Errore durante la prenotazione ospite:', error);
      await logError(error, 'Admin Guest Booking');
      toast({
        variant: 'destructive',
        title: 'Errore Prenotazione Ospite',
        description:
          error.message || 'Impossibile completare la prenotazione ospite.',
          duration: 7000,
      });
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
            <CardDescription>
              Gestisci configurazioni orario, utenti e prenotazioni.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Tabs defaultValue="schedule-config" className="w-full">
              <TabsList className="grid w-full grid-cols-1 sm:grid-cols-4">
                <TabsTrigger value="schedule-config" disabled={isLoading}>
                  Gestione Orario Aule
                </TabsTrigger>
                <TabsTrigger value="guest-booking" disabled={isLoading}>
                  Prenotazione Singola
                </TabsTrigger>
                <TabsTrigger value="users" disabled={isLoading}>
                  Utenti
                </TabsTrigger>
                <TabsTrigger value="bookings" disabled={isLoading}>
                  Tutte le Prenotazioni
                </TabsTrigger>
              </TabsList>

              {/* Tab: Gestione Orario Aule */}
              <TabsContent value="schedule-config">
                <Card>
                  <CardHeader>
                    <CardTitle>Configurazione Orario Aule</CardTitle>
                    <CardDescription>
                      Definisci gli orari, assegna professori, imposta date di
                      validità e salva configurazioni riutilizzabili.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Schedule Grid */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[80px] w-24 sticky left-0 bg-card z-10">
                              Ora
                            </TableHead>
                            {days.map((day) => (
                              <TableHead
                                key={day}
                                colSpan={classrooms.length}
                                className="text-center border-l border-r min-w-[200px] sm:min-w-[300px] md:min-w-[400px]"
                              >
                                {day}
                              </TableHead>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableHead className="sticky left-0 bg-card z-10">
                              Aula
                            </TableHead>
                            {days.map((day) =>
                              classrooms.map((classroom) => (
                                <TableHead
                                  key={`${day}-${classroom}`}
                                  className="min-w-[100px] sm:min-w-[150px] md:min-w-[200px] border-l text-center"
                                >
                                  {classroom}
                                </TableHead>
                              ))
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {timeSlots.map((time) => (
                            <TableRow key={time}>
                              <TableCell className="font-medium sticky left-0 bg-card z-10">
                                {time}
                              </TableCell>
                              {days.map((day) => {
                                return classrooms.map((classroom) => {
                                  const scheduleKey = `${day}-${time}-${classroom}`;
                                  const assignment = schedule[scheduleKey];
                                  const assignedProfessor =
                                    assignment?.professor || '';
                                  const professorColorClass = getProfessorColor(
                                    assignedProfessor,
                                    professors
                                  );
                                   const isGuestAssignment = assignedProfessor === GUEST_IDENTIFIER;
                                  return (
                                    <TableCell
                                      key={scheduleKey}
                                      className={cn(
                                          'border-l',
                                          // Apply bright green if it's a guest assignment, otherwise the professor's color
                                          isGuestAssignment ? guestColor : professorColorClass
                                       )}
                                    >
                                      <Select
                                        value={assignedProfessor || 'unassigned'}
                                        onValueChange={(value) =>
                                          handleProfessorAssignmentChange(
                                            day,
                                            time,
                                            classroom,
                                            value
                                          )
                                        }
                                        disabled={isLoading}
                                      >
                                        <SelectTrigger className="w-full text-xs sm:text-sm">
                                          <SelectValue placeholder="Assegna">
                                            {assignedProfessor === GUEST_IDENTIFIER ? 'Ospite' : (assignedProfessor || 'Assegna')}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="unassigned">
                                            Non Assegnato
                                          </SelectItem>
                                          {/* Use GUEST_IDENTIFIER for value */}
                                          <SelectItem value={GUEST_IDENTIFIER}>
                                            Ospite (Prenotazione Singola)
                                          </SelectItem>
                                          {professors.map((profEmail) => (
                                            <SelectItem
                                              key={profEmail}
                                              value={profEmail}
                                            >
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

                    {/* Configuration Saving Section */}
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div>
                        <label htmlFor="configName" className="block text-sm font-medium mb-1">Nome Configurazione</label>
                        <Input
                          id="configName"
                          value={configName}
                          onChange={(e) => setConfigName(e.target.value)}
                          placeholder="Es: Orario Estivo 2024"
                          disabled={isSavingConfig}
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 col-span-1 md:col-span-2 items-end">
                        <div className="flex-1">
                           <label className="block text-sm font-medium mb-1">Data Inizio</label>
                           <Calendar
                             mode="single"
                             selected={configStartDate}
                             onSelect={setConfigStartDate}
                             className="rounded-md border w-full [&_button]:text-xs [&_caption]:text-sm" // Compact calendar
                             locale={it}
                             disabled={isSavingConfig}
                           />
                         </div>
                         <div className="flex-1">
                           <label className="block text-sm font-medium mb-1">Data Fine</label>
                           <Calendar
                             mode="single"
                             selected={configEndDate}
                             onSelect={setConfigEndDate}
                             className="rounded-md border w-full [&_button]:text-xs [&_caption]:text-sm" // Compact calendar
                             locale={it}
                             disabled={isSavingConfig || !configStartDate}
                             fromDate={configStartDate} // Disable dates before start date
                           />
                         </div>
                       <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => saveScheduleConfiguration(false)} // Initial save attempt without replace flag
                            disabled={isSavingConfig || isLoading}
                          >
                            {isSavingConfig ? 'Salvataggio...' : 'Salva Configurazione'}
                          </Button>
                          <Button
                            onClick={resetScheduleConfiguration}
                            variant="outline"
                             disabled={isSavingConfig || isLoading}
                           >
                             Pulisci Tabella
                           </Button>
                       </div>
                      </div>
                    </div>

                    {/* Saved Configurations List */}
                    <Separator />
                    <div>
                      <h4 className="text-md font-semibold mb-2">
                        Configurazioni Salvate
                      </h4>
                      {isLoading ? (
                        <p>Caricamento configurazioni...</p>
                      ) : savedConfigurations.length > 0 ? (
                        <div className="max-h-60 overflow-y-auto border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Data Inizio</TableHead>
                                <TableHead>Data Fine</TableHead>
                                <TableHead>Azioni</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {savedConfigurations.map((config) => (
                                <TableRow key={config.id}>
                                  <TableCell>{config.name}</TableCell>
                                  <TableCell>
                                    {config.startDate ? format(parseISO(config.startDate), 'dd/MM/yyyy', { locale: it }) : 'N/A'}
                                  </TableCell>
                                  <TableCell>
                                    {config.endDate ? format(parseISO(config.endDate), 'dd/MM/yyyy', { locale: it }) : 'N/A'}
                                  </TableCell>
                                  <TableCell className="flex gap-2">
                                    <Button
                                      onClick={() => loadConfiguration(config.id)}
                                      size="sm"
                                      variant="outline"
                                      disabled={isLoading}
                                    >
                                      Carica
                                    </Button>
                                    <Button
                                      onClick={() => openDeleteConfirmation(config)}
                                      size="sm"
                                      variant="destructive"
                                      disabled={isLoading || isDeletingConfig}
                                    >
                                      {isDeletingConfig && configToDelete?.id === config.id ? 'Eliminazione...' : 'Elimina'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p>Nessuna configurazione salvata.</p>
                      )}
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
                    {/* Guest Calendar */}
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={guestBookingDate}
                        onSelect={setGuestBookingDate}
                        className="rounded-md border"
                        locale={it}
                        disabled={(date) => !date || isBefore(date, startOfDay(new Date())) || isLoading}
                      />
                    </div>
                    {/* Guest Available Slots & Booking Form */}
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold">
                        Slot Ospite Disponibili per{' '}
                        {guestBookingDate
                          ? format(guestBookingDate, 'dd/MM/yyyy', {locale: it})
                          : 'Seleziona data'}
                      </h4>
                      {isLoading ? (
                        <p>Caricamento slot...</p>
                      ) : !guestBookingDate || !isValid(guestBookingDate)? (
                        <p className="text-muted-foreground">Seleziona una data valida dal calendario.</p>
                        ) : availableGuestSlots.length === 0 ? (
                        <p className="text-muted-foreground">
                          Nessuno slot 'Ospite' disponibile per questa data
                          secondo le configurazioni attive, oppure sono già prenotati.
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
                            {availableGuestSlots.map((slotKey) => (
                              <SelectItem key={slotKey} value={slotKey}>
                                {`${slotKey.split('-')[0]} - ${slotKey.split('-')[1]}`}
                              </SelectItem>
                            ))}
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
                    <CardDescription>
                      Approva o rifiuta nuove registrazioni utente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      {isLoading ? (
                        <p>Caricamento...</p>
                      ) : pendingRegistrations.length > 0 ? (
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
                                <TableCell>
                                  {reg.role === 'professor'
                                    ? 'Professore'
                                    : 'Studente'}
                                </TableCell>
                                <TableCell>{reg.email}</TableCell>
                                <TableCell className="flex flex-wrap gap-2">
                                  <Button
                                    onClick={() => approveRegistration(reg.email)}
                                    size="sm"
                                    disabled={isLoading}
                                  >
                                    Approva
                                  </Button>
                                  <Button
                                    onClick={() => rejectRegistration(reg.email)}
                                    variant="destructive"
                                    size="sm"
                                    disabled={isLoading}
                                  >
                                    Rifiuta
                                  </Button>
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
                    <CardDescription>
                      Elenco di tutti gli studenti e professori approvati.
                      Assegna professori agli utenti.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      {isLoading ? (
                        <p>Caricamento...</p>
                      ) : approvedUsers.length > 0 ? (
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
                                <TableCell>
                                  {user.role.charAt(0).toUpperCase() +
                                    user.role.slice(1)}
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                  {(user.assignedProfessorEmails &&
                                    user.assignedProfessorEmails.length > 0)
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

              {/* Tab: Bookings */}
              <TabsContent value="bookings">
                <Card>
                  <CardHeader>
                    <CardTitle>Tutte le Lezioni Prenotate</CardTitle>
                    <CardDescription>
                      Elenco di tutte le lezioni prenotate nel sistema, ordinate
                      per data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      {isLoading ? (
                        <p>Caricamento...</p>
                      ) : allBookedSlots.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Ora</TableHead>
                              <TableHead>Aula</TableHead>
                              <TableHead>Professore</TableHead>
                              <TableHead>Studente/Prof./Ospite</TableHead>
                              <TableHead>Ora Prenotazione</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {allBookedSlots.map((slot) => (
                              <TableRow key={`booked-${slot.id}`}>
                                <TableCell>
                                  {slot.date ? format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it }) : 'Data non valida'}
                                </TableCell>
                                <TableCell>{slot.time}</TableCell>
                                <TableCell>{slot.classroom}</TableCell>
                                <TableCell>
                                  {slot.professorEmail === GUEST_IDENTIFIER
                                    ? 'Ospite'
                                    : slot.professorEmail}
                                </TableCell>
                                <TableCell>{slot.bookedBy}</TableCell>
                                <TableCell>
                                  {slot.bookingTime && isValid(parseISO(slot.bookingTime))
                                    ? format(
                                      parseISO(slot.bookingTime),
                                      'dd/MM/yyyy HH:mm',
                                      {locale: it}
                                    )
                                    : 'N/A'}
                                </TableCell>
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
      {/* Dialog for Confirming Replacement */}
      <AlertDialog
        open={showReplaceConfirmDialog}
        onOpenChange={setShowReplaceConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Configurazione Esistente Trovata</AlertDialogTitle>
            <AlertDialogDescription>
              Esiste già una configurazione con il nome "{configToReplace?.name || ''}". Vuoi sostituirla con la nuova configurazione "{configName}"? La sostituzione aggiornerà la configurazione esistente mantenendo il suo ID.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowReplaceConfirmDialog(false);
                setConfigToReplace(null);
              }}
              disabled={isSavingConfig}
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReplaceConfirm}
              disabled={isSavingConfig}
            >
              {isSavingConfig ? 'Sostituzione...' : 'Sostituisci'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Dialog for Confirming Deletion */}
      <AlertDialog
          open={showDeleteConfirmDialog}
          onOpenChange={setShowDeleteConfirmDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler eliminare la configurazione "{configToDelete?.name}"? Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                   setShowDeleteConfirmDialog(false);
                   setConfigToDelete(null);
                 }}
                 disabled={isDeletingConfig}
               >
                 Annulla
               </AlertDialogCancel>
               <AlertDialogAction
                 onClick={deleteConfiguration}
                 disabled={isDeletingConfig}
                 className={cn(
                   buttonVariants({ variant: "destructive" }), // Use buttonVariants helper
                   isDeletingConfig ? "opacity-50 cursor-not-allowed" : ""
                 )}
               >
                 {isDeletingConfig ? 'Eliminazione...' : 'Elimina'}
               </AlertDialogAction>
             </AlertDialogFooter>
           </AlertDialogContent>
         </AlertDialog>
    </>
  );
}

// Helper function to get button variants (if needed elsewhere)
// Ensure this function is defined or imported if used outside this component
// (It's used above in the delete confirmation dialog)
const buttonVariants = ({ variant }: { variant?: string | null }) => {
   if (variant === "destructive") {
     return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
   }
   return "bg-primary text-primary-foreground hover:bg-primary/90"; // Default
 };

    