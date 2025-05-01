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
import {sendEmail}from '@/services/email';
import {useToast}from "@/hooks/use-toast";
import type { UserData, AllUsersData } from '@/types/user';
import { Separator } from '@/components/ui/separator';
import { format, parseISO, isWithinInterval, startOfDay, isBefore } from 'date-fns';
import { ManageUserProfessorsDialog } from './manage-user-professors-dialog';
import { cn } from "@/lib/utils";
import type {DisplayUser}from '@/types/display-user';
import type { BookableSlot, ScheduleAssignment, BookingViewSlot } from '@/types/schedule'; // Import schedule types
import type { AllProfessorAvailability, ClassroomSchedule } from '@/types/app-data'; // Import app data types
import { it } from 'date-fns/locale';
import { readData, writeData } from '@/services/data-storage'; // Import data storage service
import { logError } from '@/services/logging'; // Import the error logging service
import { Input } from '@/components/ui/input'; // Import Input
import { Calendar } from '@/components/ui/calendar'; // Import Calendar
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'; // Import Popover
import type { DateRange } from 'react-day-picker'; // Import DateRange
import { Calendar as CalendarIcon } from "lucide-react"; // Import CalendarIcon
import type { ScheduleConfiguration, AllScheduleConfigurations } from '@/types/schedule-configuration'; // Import configuration types
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'; // Import AlertDialog components

// Constants for filenames
const USERS_DATA_FILE = 'users';
const AVAILABILITY_DATA_FILE = 'availability';
const SCHEDULE_DATA_FILE = 'schedule'; // Represents the *currently being edited* schedule
const SCHEDULE_CONFIGURATIONS_FILE = 'scheduleConfigurations'; // Stores saved, named configurations
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Session key (localStorage)

// Define available classrooms (could be moved to a config file later)
const classrooms = ['Aula 1 Grande', 'Aula 2 Piccola'];

// Define a color palette for professors
const professorColors = [
  'bg-blue-100 dark:bg-blue-900', 'bg-green-100 dark:bg-green-900', 'bg-yellow-100 dark:bg-yellow-900', 'bg-purple-100 dark:bg-purple-900',
  'bg-pink-100 dark:bg-pink-900', 'bg-indigo-100 dark:bg-indigo-900', 'bg-teal-100 dark:bg-teal-900',
  'bg-orange-100 dark:bg-orange-900', 'bg-lime-100 dark:bg-lime-900', 'bg-cyan-100 dark:bg-cyan-900',
  'bg-emerald-100 dark:bg-emerald-900',
];

// Helper function to find relevant (non-expired) schedule configurations for a given date
export const findRelevantConfigurations = (date: Date, configurations: ScheduleConfiguration[]): ScheduleConfiguration[] => {
    if (!configurations || configurations.length === 0) {
        return [];
    }
    const targetDateStart = startOfDay(date); // Compare against the start of the target date

    return configurations.filter(config => {
        try {
            const endDate = startOfDay(parseISO(config.endDate)); // Get start of end date for comparison
            // Check if end date is today or in the future relative to the target date
            return !isBefore(endDate, targetDateStart);
        } catch (e) {
            console.error(`Error parsing end date for configuration ${config.id}:`, e);
            return false; // Exclude configs with invalid dates
        }
    });
};

// Helper function for deep equality check
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (obj1 === null || typeof obj1 !== "object" || obj2 === null || typeof obj2 !== "object") {
    return false;
  }

  const keys1 = Object.keys(obj1).sort(); // Sort keys for consistent comparison
  const keys2 = Object.keys(obj2).sort();

  if (keys1.length !== keys2.length) return false;

  for (let i = 0; i < keys1.length; i++) {
    const key = keys1[i];
    if (key !== keys2[i] || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}


// Function to get a color class based on professor email
const getProfessorColor = (professorEmail: string, allProfessors: string[]): string => {
    if (!professorEmail) {
        return 'bg-background'; // Default background if no professor is assigned
    }
    const index = allProfessors.indexOf(professorEmail);
    return index === -1 ? 'bg-gray-100 dark:bg-gray-800' : professorColors[index % professorColors.length]; // Fallback color
};


export function AdminInterface() {
  const [pendingRegistrations, setPendingRegistrations] = useState<DisplayUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<DisplayUser[]>([]);
  const [professors, setProfessors] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ClassroomSchedule>({}); // Current editable schedule
  const [allBookedSlots, setAllBookedSlots] = useState<BookableSlot[]>([]);
  const [isManageProfessorsDialogOpen, setIsManageProfessorsDialogOpen] = useState(false);
  const [selectedUserForProfessorManagement, setSelectedUserForProfessorManagement] = useState<DisplayUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Loading state

  // State for schedule configuration management
  const [configName, setConfigName] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [savedConfigurations, setSavedConfigurations] = useState<ScheduleConfiguration[]>([]);

  // State for overwrite confirmation dialog
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [configToOverwriteId, setConfigToOverwriteId] = useState<string | null>(null);
  const [configToSave, setConfigToSave] = useState<ScheduleConfiguration | null>(null);


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
    console.log("[Admin] Starting data load...");
    setIsLoading(true);
    try {
      console.log("[Admin] Reading users data...");
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      console.log("[Admin] Users data read.");

      console.log("[Admin] Reading availability data...");
      const allAvailability = await readData<AllProfessorAvailability>(AVAILABILITY_DATA_FILE, {});
      console.log("[Admin] Availability data read.");

      console.log("[Admin] Reading current schedule data (for editing)...");
      const loadedSchedule = await readData<ClassroomSchedule>(SCHEDULE_DATA_FILE, {});
      console.log("[Admin] Current schedule data read.");

      console.log("[Admin] Reading saved schedule configurations...");
      const loadedConfigurations = await readData<AllScheduleConfigurations>(SCHEDULE_CONFIGURATIONS_FILE, []);
      console.log("[Admin] Saved schedule configurations read.");

      const loadedPending: DisplayUser[] = [];
      const loadedApproved: DisplayUser[] = [];
      const loadedProfessors: string[] = [];
      let idCounter = 1;

      // Process Users
      console.log("[Admin] Processing user data...");
      Object.entries(allUsers).forEach(([email, userData]) => {
         if (userData && userData.role && ['student', 'professor', 'admin'].includes(userData.role) && typeof userData.approved === 'boolean') {
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
      setApprovedUsers(loadedApproved.sort((a, b) => a.email.localeCompare(b.email))); // Sort approved users
      setProfessors(loadedProfessors.sort());
      console.log(`[Admin] Processed ${loadedPending.length} pending, ${loadedApproved.length} approved users, ${loadedProfessors.length} professors.`);

      // Process Booked Slots from Availability Data
       console.log("[Admin] Processing booked slots...");
       const loadedAllBooked: BookableSlot[] = [];
       Object.values(allAvailability).flat().forEach(slot => {
           if (slot && slot.id && slot.date && slot.time && slot.classroom && slot.bookedBy && slot.professorEmail && slot.duration === 60) {
              loadedAllBooked.push(slot);
           }
       });
       setAllBookedSlots(sortSlots(loadedAllBooked));
        console.log(`[Admin] Processed ${loadedAllBooked.length} booked slots.`);

       // Set Current Schedule (for editing) and Saved Configurations
       setSchedule(loadedSchedule);
       setSavedConfigurations(loadedConfigurations.sort((a, b) => a.name.localeCompare(b.name))); // Sort by name
       console.log("[Admin] Schedule and configurations set.");
       console.log("[Admin] Data loading complete.");

    } catch (error) {
        console.error("[Admin] Failed to load data:", error);
        await logError(error, 'Admin Load Data'); // Log error to file
        toast({ variant: "destructive", title: "Errore Caricamento Dati", description: "Impossibile caricare i dati dell'applicazione." });
        // Set default empty states on error
        setPendingRegistrations([]);
        setApprovedUsers([]);
        setProfessors([]);
        setSchedule({});
        setSavedConfigurations([]); // Reset saved configurations as well
        setAllBookedSlots([]);
    } finally {
       setIsLoading(false);
    }
  }, [toast]); // Add toast to dependencies

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);


  // Save CURRENT schedule (the one being edited) to file whenever it changes
  useEffect(() => {
     if (!isLoading && Object.keys(schedule).length > 0) {
        writeData<ClassroomSchedule>(SCHEDULE_DATA_FILE, schedule)
          .catch(async (err) => {
            console.error("[Admin] Failed to save current schedule:", err);
            await logError(err, 'Admin Save Current Schedule');
            toast({ variant: "destructive", title: "Errore Salvataggio Orario", description: "Impossibile salvare l'orario corrente delle aule." });
        });
     }
     // Also save if schedule becomes empty (e.g., after reset)
     else if (!isLoading && Object.keys(schedule).length === 0) {
         writeData<ClassroomSchedule>(SCHEDULE_DATA_FILE, {}) // Write empty object
           .catch(async (err) => {
             console.error("[Admin] Failed to save empty current schedule:", err);
             await logError(err, 'Admin Save Empty Current Schedule');
             // Optional: toast notification for failure to save empty schedule
         });
     }
  }, [schedule, isLoading, toast]); // Include isLoading and toast

  const approveRegistration = async (email: string) => {
    console.log(`[Admin] Attempting to approve registration for: ${email}`);
    setIsLoading(true); // Indicate loading state
    try {
        console.log("[Admin] Reading users data for approval...");
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        console.log("[Admin] Users data read for approval.");
        const userData = allUsers[email];
        const userToApprove = pendingRegistrations.find(reg => reg.email === email);


        if (userData && userToApprove) {
            console.log(`[Admin] User data found for ${email}. Setting approved = true.`);
            userData.approved = true;
            userData.assignedProfessorEmail = userData.assignedProfessorEmail || null; // Ensure it's initialized

            console.log("[Admin] Writing updated users data...");
            await writeData<AllUsersData>(USERS_DATA_FILE, allUsers); // Save updated users data
            console.log("[Admin] Users data updated and saved.");

            // --- Update Local State Immediately ---
            setPendingRegistrations(prev => prev.filter(reg => reg.email !== email));
            // Ensure we pass the user object with updated approval status (implicitly true now)
             setApprovedUsers(prev => [...prev, { ...userToApprove, assignedProfessorEmails: userData.assignedProfessorEmail }].sort((a, b) => a.email.localeCompare(b.email))); // Keep sorted and update emails if needed

            // If the approved user is a professor, update the professors list too
             if (userToApprove.role === 'professor' && !professors.includes(email)) {
                  setProfessors(prev => [...prev, email].sort());
             }
            // --- End Local State Update ---

            // Send approval email (after state update for UI responsiveness)
            try {
              console.log(`[Admin] Sending approval email to ${email}...`);
              await sendEmail({
                  to: email,
                  subject: 'Registrazione Approvata',
                  html: '<p>La tua registrazione è stata approvata. Ora puoi accedere.</p>',
              });
              console.log(`[Admin] Approval email sent to ${email}.`);
            } catch (emailError) {
              console.error(`[Admin] Failed to send approval email to ${email}, but registration was approved:`, emailError);
              await logError(emailError, `Admin Approve Registration (Email to ${email})`);
              toast({
                  title: "Registrazione Approvata (con avviso)",
                  description: `La registrazione per ${email} è stata approvata, ma c'è stato un problema nell'invio dell'email di notifica.`,
              });
              // Continue despite email error
            }


            toast({
                title: "Registrazione Approvata",
                description: `La registrazione per ${email} è stata approvata.`,
            });
            console.log("[Admin] Approval successful. UI updated.");
        } else {
            console.error(`[Admin] User data not found or not pending: ${email}`);
            toast({ variant: "destructive", title: "Errore", description: "Dati utente non trovati o già processati." });
        }
    } catch (error: any) {
        console.error(`[Admin] Errore durante l'approvazione per ${email}:`, error);
        await logError(error, `Admin Approve Registration (Main Catch - ${email})`); // Log error to file
        toast({
            variant: "destructive",
            title: "Errore Approvazione Registrazione",
            description: `Impossibile approvare la registrazione per ${email}. Controlla errors.log per dettagli.`,
        });
    } finally {
       setIsLoading(false); // Reset loading state
       console.log(`[Admin] Approval process finished for ${email}.`);
    }
};

const rejectRegistration = async (email: string) => {
    console.log(`[Admin] Attempting to reject registration for: ${email}`);
    setIsLoading(true);
    try {
        console.log("[Admin] Reading users data for rejection...");
        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
        console.log("[Admin] Users data read for rejection.");
        const registration = pendingRegistrations.find((reg) => reg.email === email); // Check pending state first

        if (registration && allUsers[email]) {
            console.log(`[Admin] Registration found for ${email}. Deleting user data.`);
            delete allUsers[email]; // Remove user from the data object

            console.log("[Admin] Writing updated users data after rejection...");
            await writeData<AllUsersData>(USERS_DATA_FILE, allUsers); // Save the updated data
            console.log("[Admin] Users data updated and saved after rejection.");

             // --- Update Local State Immediately ---
            setPendingRegistrations(prev => prev.filter(reg => reg.email !== email));
            // --- End Local State Update ---

            // Send rejection email (after state update)
             try {
               console.log(`[Admin] Sending rejection email to ${email}...`);
               await sendEmail({
                 to: email,
                 subject: 'Registrazione Rifiutata',
                 html: '<p>La tua registrazione è stata rifiutata.</p>',
               });
               console.log(`[Admin] Rejection email sent to ${email}.`);
             } catch (emailError: any) {
                console.error(`[Admin] Errore invio email di rifiuto a ${email}:`, emailError);
                await logError(emailError, `Admin Reject Registration (Email to ${email})`); // Log error
                 toast({ title: "Avviso", description: `Registrazione rifiutata per ${email}, ma errore nell'invio email.` });
             }

            toast({
                title: "Registrazione Rifiutata",
                description: `La registrazione per ${email} è stata rifiutata ed eliminata.`,
            });
             console.log("[Admin] Rejection successful. UI updated.");
        } else {
             console.error(`[Admin] Registration not found or user data missing for rejection: ${email}`);
             toast({ variant: "destructive", title: "Errore", description: "Registrazione non trovata o dati utente mancanti." });
        }
    } catch (error: any) {
        console.error(`[Admin] Errore durante il rifiuto della registrazione per ${email}:`, error);
        await logError(error, `Admin Reject Registration (Main Catch - ${email})`); // Log error
        toast({
            variant: "destructive",
            title: "Errore Rifiuto Registrazione",
            description: `Impossibile rifiutare la registrazione per ${email}. Controlla errors.log per dettagli.`,
        });
    } finally {
        setIsLoading(false);
        console.log(`[Admin] Rejection process finished for ${email}.`);
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
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']; // Added Saturday and Sunday

  const handleProfessorAssignmentChange = (day: string, time: string, classroom: string, professorEmail: string) => {
    const key = `${day}-${time}-${classroom}`;
    const newAssignment: ScheduleAssignment = {
        professor: professorEmail === 'unassigned' ? '' : professorEmail
    };
    // Update local state immediately for responsiveness
    console.log(`[Admin] Assigning slot ${key} to professor: ${newAssignment.professor || 'Unassigned'}`);
    setSchedule(prevSchedule => ({ ...prevSchedule, [key]: newAssignment }));
    // Saving is handled by the useEffect hook watching `schedule`
};


 const handleSaveUserProfessors = async (userEmail: string, assignedEmails: string[]) => {
     console.log(`[Admin] Saving assigned professors for ${userEmail}:`, assignedEmails);
     setIsLoading(true);
     try {
         console.log("[Admin] Reading users data for professor assignment...");
         const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
         console.log("[Admin] Users data read for professor assignment.");
         const userData = allUsers[userEmail];

         if (userData) {
             console.log(`[Admin] User data found for ${userEmail}. Updating assigned professors.`);
             userData.assignedProfessorEmail = assignedEmails.length > 0 ? assignedEmails : null;
             console.log("[Admin] Writing updated users data after professor assignment...");
             await writeData<AllUsersData>(USERS_DATA_FILE, allUsers);
             console.log("[Admin] Users data updated and saved after professor assignment.");

             // --- Update Local State Immediately ---
             setApprovedUsers(prevUsers =>
                 prevUsers.map(user =>
                     user.email === userEmail
                         ? { ...user, assignedProfessorEmails: assignedEmails.length > 0 ? assignedEmails : null }
                         : user
                 ).sort((a, b) => a.email.localeCompare(b.email)) // Keep sorted
             );
             // --- End Local State Update ---


             toast({
                 title: "Professori Aggiornati",
                 description: `Le assegnazioni dei professori per ${userEmail} sono state aggiornate.`,
             });
             setIsManageProfessorsDialogOpen(false);
             setSelectedUserForProfessorManagement(null);
             console.log("[Admin] Professor assignment successful. UI updated.");
         } else {
             console.error(`[Admin] User data not found for professor assignment: ${userEmail}`);
             toast({ variant: "destructive", title: "Errore", description: "Dati utente non trovati." });
         }
     } catch (error: any) {
         console.error(`[Admin] Errore durante l'aggiornamento dei professori assegnati per ${userEmail}:`, assignedEmails, error);
         await logError(error, `Admin Save User Professors (${userEmail})`); // Log error
         toast({
             variant: "destructive",
             title: "Errore Aggiornamento",
             description: `Impossibile aggiornare i professori assegnati. Controlla errors.log per dettagli.`,
         });
     } finally {
         setIsLoading(false);
         console.log(`[Admin] Professor assignment process finished for ${userEmail}.`);
     }
 };

// Updated function to open the dialog for ANY user (student or professor)
const openManageProfessorsDialog = (user: DisplayUser) => {
    console.log(`[Admin] Opening manage professors dialog for user: ${user.email}`);
    setSelectedUserForProfessorManagement(user);
    setIsManageProfessorsDialogOpen(true);
};

 // --- Schedule Configuration Functions ---

 // Function to save or potentially trigger overwrite confirmation
 const initiateSaveConfiguration = async () => {
    if (!configName.trim()) {
        toast({ variant: "destructive", title: "Errore", description: "Inserire un nome per la configurazione." });
        return;
    }
    if (!dateRange || !dateRange.from || !dateRange.to) {
        toast({ variant: "destructive", title: "Errore", description: "Selezionare un intervallo di date valido." });
        return;
    }

    const newConfigData: Omit<ScheduleConfiguration, 'id'> = {
        name: configName.trim(),
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        schedule: { ...schedule }, // Save a copy of the current schedule grid
    };

    // Check if an existing configuration has the same name (but different dates/content)
    const configWithSameName = savedConfigurations.find(c => c.name === newConfigData.name);

    // Check if an existing config has the same dates AND content (regardless of name)
     const existingConfigWithSameContent = savedConfigurations.find(c =>
         c.startDate === newConfigData.startDate &&
         c.endDate === newConfigData.endDate &&
         deepEqual(c.schedule, newConfigData.schedule)
     );


    if (existingConfigWithSameContent && configWithSameName?.id === existingConfigWithSameContent.id) {
         toast({ title: "Configurazione Esistente", description: "Una configurazione identica (nome, date, contenuto) esiste già. Nessuna modifica apportata." });
         return;
    }

    const newConfigComplete: ScheduleConfiguration = {
        ...newConfigData,
        // Use existing ID if name matches, otherwise generate new ID
        id: configWithSameName ? configWithSameName.id : Date.now().toString()
    };

    if (configWithSameName) {
        // Prompt for overwrite
        setConfigToSave(newConfigComplete); // Store the potential config to save
        setConfigToOverwriteId(configWithSameName.id); // Store the ID to overwrite
        setShowOverwriteConfirm(true);
    } else {
        // No existing config with the same name, save directly
        await saveConfiguration(newConfigComplete, false);
    }
};

// Actual save function (can be called directly or after confirmation)
const saveConfiguration = async (configToSave: ScheduleConfiguration, overwrite = false) => {
    setIsLoading(true);
    try {
        const currentConfigs = await readData<ScheduleConfiguration[]>(SCHEDULE_CONFIGURATIONS_FILE, []);
        let updatedConfigs;

        if (overwrite) {
            console.log(`[Admin] Overwriting configuration ID: ${configToSave.id}`);
            updatedConfigs = currentConfigs.map(c => c.id === configToSave.id ? configToSave : c);
        } else {
            console.log(`[Admin] Adding new configuration ID: ${configToSave.id}`);
            // Check for ID collision just in case (highly unlikely with timestamp)
             if (currentConfigs.some(c => c.id === configToSave.id)) {
                  const newId = Date.now().toString() + Math.random().toString(16).slice(2); // Ensure unique ID
                  console.warn(`[Admin] ID collision detected, generating new ID: ${newId}`);
                  configToSave.id = newId;
             }
            updatedConfigs = [...currentConfigs, configToSave];
        }


        await writeData<ScheduleConfiguration[]>(SCHEDULE_CONFIGURATIONS_FILE, updatedConfigs);
        console.log(`[Admin] Configuration file updated. Total configurations: ${updatedConfigs.length}`);

        setSavedConfigurations(updatedConfigs.sort((a, b) => a.name.localeCompare(b.name))); // Update local state
        setConfigName(''); // Clear input fields
        setDateRange(undefined);
        setSchedule({}); // Reset the editable schedule grid to empty

        toast({ title: overwrite ? "Configurazione Aggiornata" : "Configurazione Salvata", description: `La configurazione "${configToSave.name}" è stata ${overwrite ? 'aggiornata' : 'salvata'}.` });
    } catch (error) {
        console.error("[Admin] Failed to save schedule configuration:", error);
        await logError(error, 'Admin Save Configuration');
        toast({ variant: "destructive", title: "Errore Salvataggio Configurazione", description: "Impossibile salvare la configurazione." });
    } finally {
        setIsLoading(false);
        setConfigToSave(null); // Clear temporary state
        setConfigToOverwriteId(null);
        setShowOverwriteConfirm(false); // Close dialog if open
    }
};


  const handleLoadConfiguration = (configId: string) => {
       const configToLoad = savedConfigurations.find(c => c.id === configId);
       if (configToLoad) {
           setSchedule(configToLoad.schedule); // Load the saved grid into the editable schedule
           setConfigName(configToLoad.name); // Load name and dates back to fields for reference/editing
           try {
                setDateRange({ from: parseISO(configToLoad.startDate), to: parseISO(configToLoad.endDate) });
           } catch (e) {
               console.error("Error parsing dates from loaded config:", e);
               setDateRange(undefined); // Reset date range if parsing fails
               toast({ variant: "destructive", title: "Errore Date", description: "Date della configurazione non valide." });
               return; // Stop loading if dates are invalid
           }
           toast({ title: "Configurazione Caricata", description: `Configurazione "${configToLoad.name}" caricata nella griglia per la modifica.` });
       } else {
           toast({ variant: "destructive", title: "Errore", description: "Configurazione non trovata." });
       }
   };

   const handleDeleteConfiguration = async (configId: string) => {
      setIsLoading(true);
      try {
          const currentConfigs = await readData<ScheduleConfiguration[]>(SCHEDULE_CONFIGURATIONS_FILE, []);
          const updatedConfigs = currentConfigs.filter(c => c.id !== configId);
          await writeData<ScheduleConfiguration[]>(SCHEDULE_CONFIGURATIONS_FILE, updatedConfigs);

          setSavedConfigurations(updatedConfigs.sort((a, b) => a.name.localeCompare(b.name))); // Update local state

          toast({ title: "Configurazione Eliminata", description: `Configurazione rimossa con successo.` });
      } catch (error) {
          console.error("[Admin] Failed to delete schedule configuration:", error);
          await logError(error, 'Admin Delete Configuration');
          toast({ variant: "destructive", title: "Errore Eliminazione Configurazione", description: "Impossibile eliminare la configurazione." });
      } finally {
          setIsLoading(false);
      }
   };

   const handleClearTable = () => {
      setSchedule({});
      toast({ title: "Tabella Pulita", description: "La griglia di assegnazione è stata resettata." });
   };


 // Display loading indicator
 if (isLoading && (!pendingRegistrations.length && !approvedUsers.length)) { // Show loading only on initial load or if data is truly empty
   return <div className="flex justify-center items-center h-screen"><p>Caricamento dati...</p></div>;
 }

  return (
    <>
    <div className="flex flex-col gap-4 p-4 w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Interfaccia Amministratore</CardTitle>
          <CardDescription>Gestisci registrazioni utenti, orari delle aule e visualizza le prenotazioni.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs defaultValue="classrooms" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-4"> {/* Adjusted grid columns */}
              <TabsTrigger value="classrooms">Gestione Orario Aule</TabsTrigger>
              <TabsTrigger value="configurations">Configurazioni Salvate</TabsTrigger>
              <TabsTrigger value="users">Utenti</TabsTrigger>
              <TabsTrigger value="bookings">Prenotazioni</TabsTrigger>
            </TabsList>

            {/* Tab: Gestione Orario Aule */}
            <TabsContent value="classrooms">
              <Card>
                 <CardHeader>
                     <CardTitle>Modifica Orario Corrente</CardTitle>
                     <CardDescription>Assegna professori agli slot orari nelle aule. Questa è la griglia attualmente in modifica. Salva questa configurazione con un nome e un intervallo di date.</CardDescription>
                 </CardHeader>
                 <CardContent>
                    {/* Classroom Schedule Grid */}
                     <div className="overflow-x-auto mb-6">
                         <Table>
                             {/* Table Header */}
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
                             {/* Table Body */}
                             <TableBody>
                                 {timeSlots.map((time) => (
                                     <TableRow key={time}>
                                         <TableCell className="font-medium sticky left-0 bg-background z-10">{time}</TableCell>
                                         {days.map((day) => {
                                            return classrooms.map((classroom) => {
                                                const scheduleKey = `${day}-${time}-${classroom}`;
                                                const assignment = schedule[scheduleKey];
                                                const assignedProfessor = assignment?.professor || '';
                                                const professorColorClass = getProfessorColor(assignedProfessor, professors); // Use helper function
                                                return (
                                                    <TableCell
                                                        key={scheduleKey}
                                                        className={cn('border-l', professorColorClass)} // Apply color class here
                                                    >
                                                        <Select
                                                            value={assignedProfessor || 'unassigned'}
                                                            onValueChange={(value) => handleProfessorAssignmentChange(day, time, classroom, value)}
                                                            disabled={isLoading} // Disable during load/save operations
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

                    {/* Save/Clear Configuration Section */}
                    <Separator className="my-4" />
                     <div className="grid gap-4 md:grid-cols-4"> {/* Adjusted for clear button */}
                        <div>
                          <label htmlFor="configName" className="block text-sm font-medium mb-1">Nome Configurazione</label>
                          <Input
                            id="configName"
                            placeholder="Es: Orario Standard Aprile"
                            value={configName}
                            onChange={(e) => setConfigName(e.target.value)}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="md:col-span-1">
                           <label htmlFor="dateRange" className="block text-sm font-medium mb-1">Intervallo Date Validità</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    id="dateRange"
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                    )}
                                    disabled={isLoading}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "dd/MM/y", { locale: it })} -{" "}
                                        {format(dateRange.to, "dd/MM/y", { locale: it })}
                                        </>
                                    ) : (
                                        format(dateRange.from, "dd/MM/y", { locale: it })
                                    )
                                    ) : (
                                    <span>Seleziona intervallo date</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                    locale={it}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="flex items-end">
                             <Button onClick={handleClearTable} variant="outline" disabled={isLoading} className="w-full">
                                Pulisci Tabella
                             </Button>
                        </div>
                        <div className="flex items-end">
                             <Button onClick={initiateSaveConfiguration} disabled={isLoading || !configName || !dateRange?.from || !dateRange?.to} className="w-full">
                                Salva Configurazione Orario
                             </Button>
                        </div>
                     </div>
                 </CardContent>
              </Card>
            </TabsContent>

             {/* Tab: Configurazioni Salvate */}
             <TabsContent value="configurations">
                 <Card>
                     <CardHeader>
                         <CardTitle>Configurazioni Orario Salvate</CardTitle>
                         <CardDescription>Carica o elimina configurazioni di orario salvate in precedenza.</CardDescription>
                     </CardHeader>
                     <CardContent>
                         {isLoading ? <p>Caricamento configurazioni...</p> : savedConfigurations.length === 0 ? (
                             <p className="text-muted-foreground">Nessuna configurazione salvata.</p>
                         ) : (
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
                                             <TableCell>{format(parseISO(config.startDate), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell>{format(parseISO(config.endDate), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell className="flex gap-2">
                                                 <Button onClick={() => handleLoadConfiguration(config.id)} size="sm" variant="outline" disabled={isLoading}>Carica</Button>
                                                 <Button onClick={() => handleDeleteConfiguration(config.id)} size="sm" variant="destructive" disabled={isLoading}>Elimina</Button>
                                             </TableCell>
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                         )}
                     </CardContent>
                 </Card>
             </TabsContent>


            {/* Tab: Utenti */}
            <TabsContent value="users">
             <Card>
                 <CardHeader>
                     <CardTitle>Registrazioni in Sospeso</CardTitle>
                     <CardDescription>Approva o rifiuta nuove registrazioni utente.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         {isLoading && pendingRegistrations.length === 0 && <p>Caricamento...</p>}
                         {!isLoading && pendingRegistrations.length === 0 && <p>Nessuna registrazione in sospeso.</p>}
                         {pendingRegistrations.length > 0 && (
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
                          {isLoading && approvedUsers.length === 0 && <p>Caricamento...</p>}
                          {!isLoading && approvedUsers.length === 0 && <p>Nessun utente approvato trovato.</p>}
                         {approvedUsers.length > 0 && (
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
                         )}
                     </div>
                 </CardContent>
             </Card>
            </TabsContent>

             {/* Tab: Prenotazioni */}
            <TabsContent value="bookings">
                 <Card>
                     <CardHeader>
                         <CardTitle>Tutte le Lezioni Prenotate</CardTitle>
                         <CardDescription>Elenco di tutte le lezioni prenotate nel sistema, ordinate per data.</CardDescription>
                     </CardHeader>
                     <CardContent>
                         <div className="overflow-x-auto">
                             {isLoading && allBookedSlots.length === 0 && <p>Caricamento...</p>}
                             {!isLoading && allBookedSlots.length === 0 && <p>Nessuna lezione prenotata al momento.</p>}
                             {allBookedSlots.length > 0 && (
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
                console.log("[Admin] Closing manage professors dialog.");
                setIsManageProfessorsDialogOpen(false);
                setSelectedUserForProfessorManagement(null);
            }}
            user={selectedUserForProfessorManagement}
            allProfessors={professors}
            onSave={handleSaveUserProfessors}
            isLoading={isLoading} // Pass loading state
        />
    )}
     {/* Dialog for Overwrite Confirmation */}
     <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
       <AlertDialogContent>
         <AlertDialogHeader>
           <AlertDialogTitle>Configurazione Esistente</AlertDialogTitle>
           <AlertDialogDescription>
             Esiste già una configurazione con il nome "{configToSave?.name}". Vuoi sovrascriverla con i nuovi dati (intervallo date e assegnazioni)?
           </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
           <AlertDialogCancel onClick={() => {
                setConfigToSave(null);
                setConfigToOverwriteId(null);
                setShowOverwriteConfirm(false);
            }} disabled={isLoading}>
                Annulla
            </AlertDialogCancel>
           <AlertDialogAction onClick={() => {
                if (configToSave && configToOverwriteId) {
                     saveConfiguration(configToSave, true); // Proceed with overwrite
                }
            }} disabled={isLoading}>
                {isLoading ? 'Sovrascrittura...' : 'Sovrascrivi'}
           </AlertDialogAction>
         </AlertDialogFooter>
       </AlertDialogContent>
     </AlertDialog>
    </>
  );
}
