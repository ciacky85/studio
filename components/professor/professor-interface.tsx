
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar';
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore, differenceInHours } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserData, AllUsersData } from '@/types/user'; // Import UserData types
import type { BookableSlot } from '@/types/bookable-slot'; // Import BookableSlot type
import type { ScheduleAssignment } from '@/types/schedule-assignment'; // Import ScheduleAssignment type
import type { AllProfessorAvailabilityData, ClassroomScheduleData } from '@/types/app-data'; // Import centralized data types
import { sendEmail } from '@/services/email';
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils';
import { readData, writeData } from '@/services/data-storage'; // Import data storage service

// Define the structure of a slot as seen by the professor when booking from others
interface ProfessorBookingViewSlot {
  id: string; // Unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time (e.g., '08:00')
  classroom: string;
  duration: number; // Always 60 min
  professorEmail: string; // The professor offering the slot
  isBookedByCurrentUser: boolean; // Whether the current professor booked this
  bookingTime: string | null; // ISO string, needed for cancellation check
}

// Constants for filenames and keys
const USERS_DATA_FILE = 'users';
const ALL_PROFESSOR_AVAILABILITY_FILE = 'allProfessorAvailability';
const CLASSROOM_SCHEDULE_FILE = 'classroomSchedule';
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Key for session storage

const daysOfWeek = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export function ProfessorInterface() {
  const [selectedAvailabilityDate, setSelectedAvailabilityDate] = useState<Date | undefined>(new Date());
  const [dailySlots, setDailySlots] = useState<BookableSlot[]>([]);
  const [professorBookedSlots, setProfessorBookedSlots] = useState<BookableSlot[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null);
  const [allAvailableSlotsToBook, setAllAvailableSlotsToBook] = useState<ProfessorBookingViewSlot[]>([]);
  const [myBookedLessons, setMyBookedLessons] = useState<ProfessorBookingViewSlot[]>([]);
  const [selectedBookingDate, setSelectedBookingDate] = useState<Date | undefined>(new Date());
  const {toast} = useToast();

  // Get current user email and assigned professors on mount
  useEffect(() => {
    const loadInitialData = async () => {
        if (typeof window !== 'undefined') {
            const storedUserSession = sessionStorage.getItem(LOGGED_IN_USER_KEY);
            if (storedUserSession) {
                try {
                    const sessionData = JSON.parse(storedUserSession);
                    if (sessionData.role === 'professor') {
                        setCurrentUserEmail(sessionData.username);
                        // Load user data from file to get assigned professors
                        const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
                        const professorData = allUsers[sessionData.username];
                        if (professorData) {
                            setAssignedProfessorEmails(Array.isArray(professorData.assignedProfessorEmails) ? professorData.assignedProfessorEmails : null);
                        } else {
                            console.warn("Dati specifici del professore non trovati per:", sessionData.username);
                            setAssignedProfessorEmails(null);
                        }
                    } else {
                        console.error("L'utente loggato non è un professore.");
                    }
                } catch (e) {
                    console.error("Errore durante il parsing dei dati utente/sessione:", e);
                }
            } else {
                console.error("Nessun utente loggato in sessione.");
            }
        }
    };
    loadInitialData();
  }, []);

   // Function to sort slots consistently by date then time (common helper)
   const sortSlotsByDateAndTime = <T extends { date: string; time: string }>(slots: T[]): T[] => {
       // Defensive check for invalid slot data before sorting
       return slots.sort((a, b) => {
           if (!a?.date || !b?.date || !a?.time || !b?.time) {
               console.warn('Tentativo di ordinare dati slot non validi:', a, b);
               return 0; // Avoid erroring, maintain relative order
           }
           const dateCompare = a.date.localeCompare(b.date);
           if (dateCompare !== 0) return dateCompare;
           return a.time.localeCompare(b.time);
       });
   };


  // Load/Generate slots for MANAGING OWN availability
  const loadAndGenerateOwnSlots = useCallback(async () => {
    if (!currentUserEmail) {
      setDailySlots([]);
      setProfessorBookedSlots([]);
      return;
    }

    try {
        // 1. Load admin's hourly schedule template with classrooms
        const classroomSchedule = await readData<ClassroomScheduleData>(CLASSROOM_SCHEDULE_FILE, {});

        // 2. Load all existing bookable slots
        const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});

        // Get the current professor's full list of slots (the ones they OFFER)
        const professorOfferedSlots = allProfessorAvailability[currentUserEmail] || [];

        // 3. Filter and sort slots where THIS professor WAS BOOKED
        const bookedForCurrentUser = professorOfferedSlots.filter(slot => slot && slot.bookedBy && slot.duration === 60);
        setProfessorBookedSlots(sortSlotsByDateAndTime([...bookedForCurrentUser]));

        // 4. Process slots for the *selected date* to manage availability
        if (!selectedAvailabilityDate) {
            setDailySlots([]);
            return; // No date selected, nothing to show in daily management view
        }

        const formattedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');
        const dayIndex = getDay(selectedAvailabilityDate);
        const dayOfWeekString = daysOfWeek[dayIndex];
        const isPastDate = isBefore(selectedAvailabilityDate, startOfDay(new Date()));

        // 5. Get existing slots specific to the current professor and selected date for lookup
        const professorExistingSlotsMap = new Map<string, BookableSlot>(
          professorOfferedSlots
            .filter(slot => slot && slot.date === formattedDate && slot.duration === 60 && slot.classroom) // Ensure classroom exists
            .map(slot => [slot.id, slot]) // Key is the unique slot ID
        );

        // 6. Generate potential 60-minute slots based ONLY on admin schedule assignments
        const generatedSlots: BookableSlot[] = [];
        Object.entries(classroomSchedule).forEach(([scheduleKey, assignment]) => {
          const parts = scheduleKey.split('-');
          if (parts.length < 3) return;
          const day = parts[0];
          const hourTime = parts[1]; // Expecting 'HH:00'
          const classroom = parts.slice(2).join('-');

          if (day === dayOfWeekString && assignment.professor === currentUserEmail && hourTime && hourTime.endsWith(':00')) {
            const slotId = `${formattedDate}-${hourTime}-${classroom}-${currentUserEmail}`;
            const existingSlotData = professorExistingSlotsMap.get(slotId);

            if (!isPastDate || existingSlotData?.bookedBy) {
                generatedSlots.push({
                  id: slotId, date: formattedDate, day: dayOfWeekString, time: hourTime, classroom: classroom, duration: 60,
                  isAvailable: isPastDate ? false : (existingSlotData?.isAvailable ?? false), // Default to false if no existing data for future dates
                  bookedBy: existingSlotData?.bookedBy ?? null,
                  bookingTime: existingSlotData?.bookingTime ?? null,
                  professorEmail: currentUserEmail,
                });
            }
          }
        });

        // Sort the generated daily slots by time, then classroom
        const sortedGeneratedSlots = generatedSlots.sort((a, b) => {
            const timeCompare = a.time.localeCompare(b.time);
            if (timeCompare !== 0) return timeCompare;
            return a.classroom.localeCompare(b.classroom);
        });
        setDailySlots(sortedGeneratedSlots);

    } catch (error) {
         console.error("Errore durante il caricamento/generazione degli slot propri:", error);
         toast({ variant: "destructive", title: "Errore Caricamento", description: "Impossibile caricare i tuoi slot." });
         setDailySlots([]);
         setProfessorBookedSlots([]);
    }

  }, [selectedAvailabilityDate, currentUserEmail, toast]); // Added toast dependency

   // Load slots available FOR BOOKING by this professor
   const loadSlotsToBook = useCallback(async () => {
       if (!currentUserEmail || assignedProfessorEmails === null) { // Check for null specifically
           setAllAvailableSlotsToBook([]);
           setMyBookedLessons([]);
           return;
       }
       // Handle the case where assignedProfessorEmails is an empty array
        if (assignedProfessorEmails.length === 0) {
             setAllAvailableSlotsToBook([]);
             setMyBookedLessons([]);
             // Optionally show a message that no professors are assigned
             console.log("Nessun professore assegnato per prenotare lezioni.");
             return;
        }


       try {
           const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});

           const loadedAllAvailableToBook: ProfessorBookingViewSlot[] = [];
           const loadedMyBookings: ProfessorBookingViewSlot[] = [];
           const processedBookedIds = new Set<string>();

           Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
               // Check slots from assigned professors (excluding self) for availability
               if (assignedProfessorEmails.includes(profEmail) && profEmail !== currentUserEmail) {
                   (slots || []).forEach(slot => { // Add null check for slots array
                       if (slot && slot.id && slot.date && slot.day && slot.time && slot.classroom && typeof slot.isAvailable === 'boolean' && slot.professorEmail === profEmail && slot.duration === 60) {
                           const bookingViewSlot: ProfessorBookingViewSlot = {
                               id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                               professorEmail: slot.professorEmail,
                               isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                               bookingTime: slot.bookingTime || null,
                           };
                           if (slot.isAvailable && !slot.bookedBy) {
                               try {
                                   const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                                   if (!isBefore(slotDateTime, startOfDay(new Date()))) {
                                       loadedAllAvailableToBook.push(bookingViewSlot);
                                   }
                               } catch (parseError) { console.warn(`Impossibile analizzare data/ora per lo slot ${slot.id}:`, parseError); }
                           }
                       }
                   });
               }

                // Check slots from ANY professor (even unassigned/self initially) if they are booked by the current user
                if (profEmail !== currentUserEmail) { // Exclude self-bookings from "My Booked Lessons with Others"
                   (slots || []).forEach(slot => { // Add null check for slots array
                       if (slot && slot.id && slot.classroom && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                           const bookingViewSlot: ProfessorBookingViewSlot = {
                               id: slot.id, date: slot.date, day: slot.day, time: slot.time, classroom: slot.classroom, duration: 60,
                               professorEmail: slot.professorEmail,
                               isBookedByCurrentUser: true,
                               bookingTime: slot.bookingTime || null,
                           };
                           loadedMyBookings.push(bookingViewSlot);
                           processedBookedIds.add(slot.id);
                       }
                   });
                }
           });

           setAllAvailableSlotsToBook(sortSlotsByDateAndTime(loadedAllAvailableToBook));
           setMyBookedLessons(sortSlotsByDateAndTime(loadedMyBookings));

       } catch (error) {
            console.error("Errore durante il caricamento degli slot da prenotare:", error);
            toast({ variant: "destructive", title: "Errore Caricamento", description: "Impossibile caricare gli slot disponibili per la prenotazione." });
            setAllAvailableSlotsToBook([]);
            setMyBookedLessons([]);
       }

   }, [currentUserEmail, assignedProfessorEmails, toast]); // Added toast


  // Trigger slot loading/generation on initial mount and when dependencies change
  useEffect(() => {
    loadAndGenerateOwnSlots(); // Load slots this professor offers
  }, [loadAndGenerateOwnSlots]);

  useEffect(() => {
    loadSlotsToBook(); // Load slots this professor can book from others
  }, [loadSlotsToBook]);


   // Save function (centralized for OWN availability)
   const saveOwnAvailability = useCallback(async (updatedSlotsForDay: BookableSlot[]) => {
        if (currentUserEmail && selectedAvailabilityDate) {
            try {
                const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
                let currentProfessorSlots = allProfessorAvailability[currentUserEmail] || [];
                const formattedSelectedDate = format(selectedAvailabilityDate, 'yyyy-MM-dd');

                // Filter out invalid updated slots
                const validUpdatedSlotsForDay = updatedSlotsForDay.filter(slot => slot && slot.id && slot.date && slot.time && slot.classroom && slot.duration === 60);
                const updatedDaySlotMap = new Map(validUpdatedSlotsForDay.map(slot => [slot.id, slot]));

                // Merge: Keep slots from other dates, replace/add slots for the selected date
                const newProfessorSlots = currentProfessorSlots
                    .filter(slot => slot && slot.date !== formattedSelectedDate) // Keep slots from other dates
                    .concat(validUpdatedSlotsForDay); // Add all valid updated slots for the current day

                // Filter out potentially invalid slots overall before saving
                const validatedSlots = newProfessorSlots.filter(slot => slot && slot.date && slot.time && slot.classroom && slot.duration === 60);

                allProfessorAvailability[currentUserEmail] = sortSlotsByDateAndTime(validatedSlots);
                await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);
                 // Optionally reload own slots after saving to confirm changes
                 // await loadAndGenerateOwnSlots(); // Or just rely on optimistic UI update
            } catch (error) {
                 console.error("Errore durante il salvataggio della disponibilità:", error);
                 toast({ variant: "destructive", title: "Errore Salvataggio", description: "Impossibile salvare le modifiche alla disponibilità." });
                 // Consider reloading data to revert optimistic UI changes on error
                 await loadAndGenerateOwnSlots();
            }
        }
   }, [currentUserEmail, selectedAvailabilityDate, toast, loadAndGenerateOwnSlots]); // Added dependencies


  const toggleSlotAvailability = (id: string) => {
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedAvailabilityDate) { console.error("Slot non trovato o data non selezionata:", id); return; }
    if (slotToToggle.bookedBy) {
       toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità di uno slot prenotato." });
       return;
    }
     if (isBefore(selectedAvailabilityDate, startOfDay(new Date()))) {
          toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità per date passate." });
          return;
     }

    const updatedSlot = { ...slotToToggle, isAvailable: !slotToToggle.isAvailable };
    const updatedDailySlots = dailySlots.map((slot) => slot.id === id ? updatedSlot : slot);
    setDailySlots(updatedDailySlots); // Optimistic UI update

    // Persist the change
    saveOwnAvailability(updatedDailySlots); // Save all slots for the day

    toast({ title: updatedSlot.isAvailable ? "Slot Reso Disponibile" : "Slot Reso Non Disponibile", description: `Slot alle ${slotToToggle.time} in ${slotToToggle.classroom} del ${format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it })} è ora ${updatedSlot.isAvailable ? 'disponibile' : 'non disponibile'}.` });
  };

  // Function to cancel a booking MADE BY OTHERS for THIS professor's slots
  const cancelOwnBooking = useCallback(async (slotId: string) => {
    if (!currentUserEmail) return;

     try {
        const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
        let professorSlots = allProfessorAvailability[currentUserEmail];

        if (!professorSlots) throw new Error("Slot professore non trovati per cancellazione.");

        const slotIndex = professorSlots.findIndex(s => s && s.id === slotId && s.duration === 60);
        if (slotIndex === -1) throw new Error("Slot da cancellare non trovato o già cancellato.");

        const slotToCancel = professorSlots[slotIndex];
        const bookerEmail = slotToCancel.bookedBy;
        if (!bookerEmail) { console.warn("Slot non prenotato, impossibile cancellare."); return; }

        // Prepare email details
        const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
        const formattedTime = slotToCancel.time;
        const classroomInfo = slotToCancel.classroom;
        const eventTitle = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
        const { deleteLink } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitle, eventTitle, classroomInfo);

        // Update the slot
        const updatedSlot = { ...slotToCancel, bookedBy: null, bookingTime: null, isAvailable: true };
        professorSlots[slotIndex] = updatedSlot;

        // Save the updated data
        allProfessorAvailability[currentUserEmail] = professorSlots;
        await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);

        // Send cancellation emails
        try {
          await sendEmail({
            to: bookerEmail,
            subject: 'Lezione Cancellata dal Professore',
            html: `<p>Ciao,</p><p>La tua lezione in ${classroomInfo} con il Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata dal professore.</p>
                   <p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLink}">Rimuovi dal Calendario</a></p>`,
          });
          await sendEmail({
            to: currentUserEmail,
            subject: 'Conferma Cancellazione Lezione Effettuata',
            html: `<p>Ciao Prof. ${currentUserEmail},</p><p>Hai cancellato la prenotazione di ${bookerEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}. Lo slot è di nuovo disponibile.</p>`,
          });
        } catch (emailError) {
           console.error("Errore invio email di cancellazione (professore):", emailError);
           toast({ variant: "destructive", title: "Avviso Invio Email", description: "Cancellazione completata, ma errore nell'invio delle notifiche email.", duration: 7000 });
        }

        // Refresh UI states
        await loadAndGenerateOwnSlots();
        await loadSlotsToBook();

        toast({ title: "Prenotazione Cancellata", description: `Prenotazione da ${bookerEmail} per ${formattedDate} alle ${formattedTime} in ${classroomInfo} cancellata. Lo slot è di nuovo disponibile.` });

     } catch (error) {
         console.error("Errore durante la cancellazione della prenotazione propria:", error);
         toast({ variant: "destructive", title: "Errore Cancellazione", description: `Impossibile cancellare la prenotazione. ${error instanceof Error ? error.message : ''}` });
         // Reload data on error to ensure UI consistency
         await loadAndGenerateOwnSlots();
         await loadSlotsToBook();
     }
  }, [currentUserEmail, loadAndGenerateOwnSlots, toast, loadSlotsToBook]); // Added dependencies


  // --- Functions for Booking Lessons with OTHER Professors ---

  // Function to book a slot with another assigned professor
   const bookLessonWithProfessor = useCallback(async (slotToBook: ProfessorBookingViewSlot) => {
       if (!currentUserEmail) return;

       try {
           // Check assignment again
           if (!assignedProfessorEmails || !assignedProfessorEmails.includes(slotToBook.professorEmail)) {
               throw new Error("Puoi prenotare solo slot di professori a te assegnati.");
           }

           const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
           const targetProfessorSlots = allProfessorAvailability[slotToBook.professorEmail];
           if (!targetProfessorSlots) throw new Error("Slot professore target non trovati.");

           const slotIndex = targetProfessorSlots.findIndex(s => s && s.id === slotToBook.id && s.duration === 60);
           if (slotIndex === -1) throw new Error("Slot non trovato o non più valido.");

           const originalSlot = targetProfessorSlots[slotIndex];
           let slotDateTime; try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
           if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
               throw new Error("Lo slot non è più disponibile o è nel passato.");
           }

           // Update the slot
           originalSlot.bookedBy = currentUserEmail;
           originalSlot.bookingTime = new Date().toISOString();
           originalSlot.isAvailable = false;

           // Save the updated data for the TARGET professor
           allProfessorAvailability[slotToBook.professorEmail] = targetProfessorSlots;
           await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);

           // Prepare email details
           const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
           const formattedTime = slotToBook.time;
           const classroomInfo = slotToBook.classroom;
           const eventTitleBooker = `Lezione in ${classroomInfo} con Prof. ${slotToBook.professorEmail}`;
           const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
           const descriptionBooker = `Lezione prenotata con ${slotToBook.professorEmail} in ${classroomInfo}.`;
           const descriptionProfessor = `Lezione prenotata da ${currentUserEmail} in ${classroomInfo}.`;
           const { addLink: addLinkBooker } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleBooker, eventTitleBooker, classroomInfo, descriptionBooker);
           const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo, descriptionProfessor);

           // Send confirmation emails
            try {
              await sendEmail({
                to: currentUserEmail,
                subject: 'Conferma Prenotazione Lezione con Collega',
                html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkBooker}">Aggiungi al Calendario</a></p>`,
              });
              await sendEmail({
                to: slotToBook.professorEmail,
                subject: 'Nuova Prenotazione Ricevuta da Collega',
                html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dal Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo}.</p><p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>`,
              });
            } catch (emailError) {
               console.error("Errore invio email di conferma (prof-prof):", emailError);
               toast({ variant: "destructive", title: "Avviso Invio Email", description: "Prenotazione completata, ma errore nell'invio delle notifiche email.", duration: 7000 });
            }

           // Refresh the lists related to booking lessons
           await loadSlotsToBook();

           toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata per il ${formattedDate} alle ${formattedTime} in ${classroomInfo}.` });

       } catch (error) {
            console.error("Errore durante la prenotazione della lezione con il professore:", error);
            toast({ variant: "destructive", title: "Errore Prenotazione", description: `Impossibile prenotare la lezione. ${error instanceof Error ? error.message : ''}` });
            // Reload data on error
            await loadSlotsToBook();
       }
   }, [currentUserEmail, assignedProfessorEmails, loadSlotsToBook, toast]); // Added dependencies

   // Function to cancel a booking THIS professor made with ANOTHER professor
   const cancelLessonWithProfessor = useCallback(async (slotToCancel: ProfessorBookingViewSlot) => {
      if (!currentUserEmail) return;

      try {
          // 24-hour cancellation check
          let lessonStartTime; try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch { throw new Error("Formato data/ora slot non valido."); }
          if (differenceInHours(lessonStartTime, new Date()) < 24) {
              throw new Error("Impossibile cancellare meno di 24 ore prima.");
          }

          const allProfessorAvailability = await readData<AllProfessorAvailabilityData>(ALL_PROFESSOR_AVAILABILITY_FILE, {});
          const targetProfessorSlots = allProfessorAvailability[slotToCancel.professorEmail];
          if (!targetProfessorSlots) throw new Error("Slot professore target non trovati per cancellazione.");

          const slotIndex = targetProfessorSlots.findIndex(s => s && s.id === slotToCancel.id && s.duration === 60);
          if (slotIndex === -1) throw new Error("Slot da cancellare non trovato o già cancellato.");

          const originalSlot = targetProfessorSlots[slotIndex];
          if (originalSlot.bookedBy !== currentUserEmail) throw new Error("Non puoi cancellare questa prenotazione.");

          // Update slot data
          originalSlot.bookedBy = null;
          originalSlot.bookingTime = null;
          originalSlot.isAvailable = true;

          // Save updated data for the TARGET professor
          allProfessorAvailability[slotToCancel.professorEmail] = targetProfessorSlots;
          await writeData(ALL_PROFESSOR_AVAILABILITY_FILE, allProfessorAvailability);

           // Prepare email details
           const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
           const formattedTime = slotToCancel.time;
           const classroomInfo = slotToCancel.classroom;
           const eventTitleBooker = `Lezione in ${classroomInfo} con Prof. ${slotToCancel.professorEmail}`;
           const eventTitleProfessor = `Lezione in ${classroomInfo} con Prof. ${currentUserEmail}`;
           const { deleteLink: deleteLinkBooker } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleBooker, eventTitleBooker, classroomInfo);
           const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor, classroomInfo);

           // Send cancellation emails
           try {
             await sendEmail({
               to: currentUserEmail,
               subject: 'Conferma Cancellazione Lezione con Collega',
               html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} in ${classroomInfo} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkBooker}">Rimuovi dal Calendario</a></p>`,
             });
             await sendEmail({
               to: slotToCancel.professorEmail,
               subject: 'Prenotazione Cancellata da Collega',
               html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione del Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} in ${classroomInfo} è stata cancellata.</p><p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>`,
             });
           } catch (emailError) {
             console.error("Errore invio email di cancellazione (prof-prof):", emailError);
              toast({ variant: "destructive", title: "Avviso Invio Email", description: "Cancellazione completata, ma errore nell'invio delle notifiche email.", duration: 7000 });
           }

           // Refresh the lists related to booking lessons
           await loadSlotsToBook();

           toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} il ${formattedDate} alle ${formattedTime} in ${classroomInfo} è stata cancellata.` });

      } catch (error) {
           console.error("Errore durante la cancellazione della lezione con il professore:", error);
           toast({ variant: "destructive", title: "Errore Cancellazione", description: `Impossibile cancellare la prenotazione. ${error instanceof Error ? error.message : ''}` });
           // Reload data on error
           await loadSlotsToBook();
      }
   }, [currentUserEmail, loadSlotsToBook, toast]); // Added dependencies

   // Filter available slots based on the selected booking date
    const filteredAvailableSlotsToBook = selectedBookingDate
      ? allAvailableSlotsToBook.filter(slot => slot.date === format(selectedBookingDate, 'yyyy-MM-dd'))
      : [];


  return (
    <div className="flex flex-col gap-6 p-4 w-full">
       <Tabs defaultValue="manage-availability" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2"> {/* Adjusted to 2 columns */}
                <TabsTrigger value="manage-availability">Gestisci Disponibilità</TabsTrigger>
                <TabsTrigger value="book-lessons">Prenota Lezioni con Altri Professori</TabsTrigger>
            </TabsList>

            {/* Tab 1: Manage Own Availability */}
            <TabsContent value="manage-availability">
                 <Card className="w-full">
                    <CardHeader>
                        <CardTitle>Gestisci la Tua Disponibilità</CardTitle>
                        <CardDescription>Seleziona una data per gestire i tuoi slot prenotabili da 60 minuti all'interno delle tue aule/orari assegnati.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="flex justify-center">
                            <Calendar
                                locale={it} mode="single" selected={selectedAvailabilityDate} onSelect={setSelectedAvailabilityDate}
                                className="rounded-md border"
                                disabled={(date) => isBefore(date, startOfDay(new Date())) && !professorBookedSlots.some(slot => slot.date === format(date, 'yyyy-MM-dd'))} // Disable past dates unless booked
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">
                              Gestisci Slot per {selectedAvailabilityDate ? format(selectedAvailabilityDate, 'dd/MM/yyyy', { locale: it }) : 'Nessuna data selezionata'}
                            </h3>
                            {dailySlots.length === 0 ? (
                                <p className="text-muted-foreground p-4 text-center">
                                   {selectedAvailabilityDate ? (isBefore(selectedAvailabilityDate, startOfDay(new Date())) ? "Impossibile gestire slot per date passate (a meno che non siano già prenotate)." : `Nessuno slot orario da 60 minuti assegnato dall'admin per te il ${daysOfWeek[getDay(selectedAvailabilityDate)]}.`) : 'Seleziona una data per visualizzare gli slot.'}
                                </p>
                            ) : (
                                <div className="overflow-x-auto border rounded-md max-h-96">
                                  <Table>
                                    <TableHeader><TableRow><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Stato</TableHead><TableHead className="w-40 text-center">Azioni</TableHead><TableHead>Info Prenotazione</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                      {dailySlots.map((slot) => {
                                        const isBooked = !!slot.bookedBy;
                                        const isPastSlot = selectedAvailabilityDate ? isBefore(selectedAvailabilityDate, startOfDay(new Date())) : false;
                                        const isPastAndNotBooked = isPastSlot && !isBooked; // Slot is in the past AND not booked
                                        const statusText = isBooked ? 'Prenotato' : (slot.isAvailable ? 'Disponibile' : 'Non Disponibile');
                                        const statusColor = isBooked ? 'text-gray-500' : (slot.isAvailable ? 'text-green-600' : 'text-red-600');

                                        return (
                                          <TableRow key={slot.id}>
                                            <TableCell>{slot.time}</TableCell>
                                            <TableCell>{slot.classroom}</TableCell>
                                            <TableCell className="text-center">{slot.duration} min</TableCell>
                                            <TableCell className={`${statusColor} font-medium`}>{statusText}</TableCell>
                                            <TableCell className="text-center">
                                                 {isBooked || isPastAndNotBooked ? (
                                                    // Show 'Prenotato' or 'Passato' text, non-clickable
                                                    <span className={cn("font-normal px-1 italic", isBooked ? "text-gray-500" : "text-muted-foreground")}>
                                                        {isBooked ? 'Prenotato' : 'Passato'}
                                                    </span>
                                                 ) : (
                                                     // Show the availability toggle button
                                                     <Button
                                                         onClick={() => toggleSlotAvailability(slot.id)}
                                                         variant={slot.isAvailable ? 'destructive' : 'default'}
                                                         size="sm"
                                                         className={cn(
                                                             'text-white',
                                                             slot.isAvailable
                                                                 ? 'bg-red-600 hover:bg-red-700'
                                                                 : 'bg-green-600 hover:bg-green-700'
                                                         )}
                                                     >
                                                         {slot.isAvailable ? 'Rendi Non Disp.' : 'Rendi Disp.'}
                                                     </Button>
                                                 )}
                                             </TableCell>
                                            <TableCell>
                                              {slot.bookedBy ? `Da ${slot.bookedBy}${slot.bookingTime ? ` (${format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it })})` : ''}` : '—'}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                            )}
                        </div>
                    </CardContent>
                 </Card>
                 {/* List of all booked lessons FOR this professor */}
                  <Card className="w-full mt-6">
                       <CardHeader>
                           <CardTitle>Tutte le Tue Lezioni Prenotate con Te</CardTitle>
                           <CardDescription>Elenco di tutte le lezioni attualmente prenotate con te. Puoi cancellarle da qui.</CardDescription>
                       </CardHeader>
                       <CardContent>
                           {professorBookedSlots.length === 0 ? (
                               <p className="text-muted-foreground p-4 text-center">Nessuna lezione è attualmente prenotata con te.</p>
                           ) : (
                               <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                       <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Prenotato Da</TableHead><TableHead>Ora Prenotazione</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                       <TableBody>
                                           {professorBookedSlots.map((slot) => {
                                               if (!slot || !slot.id) return null;
                                                let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`booked-prof-${slot.id}`}><TableCell colSpan={7}>Dati slot non validi</TableCell></TableRow>; }
                                                const isPastLesson = isBefore(lessonDateTime, new Date());
                                               return (
                                                   <TableRow key={`booked-prof-${slot.id}`}>
                                                       <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                       <TableCell>{slot.time}</TableCell>
                                                       <TableCell>{slot.classroom}</TableCell>
                                                       <TableCell className="text-center">{slot.duration} min</TableCell>
                                                       <TableCell>{slot.bookedBy}</TableCell>
                                                       <TableCell>{slot.bookingTime ? format(parseISO(slot.bookingTime), 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}</TableCell>
                                                       <TableCell className="text-center">
                                                        {isPastLesson ? (
                                                             <span className="text-muted-foreground italic">Lezione passata</span>
                                                        ) : (
                                                           <Button onClick={() => cancelOwnBooking(slot.id)} variant="destructive" size="sm">Cancella Prenotazione</Button>
                                                        )}
                                                       </TableCell>
                                                   </TableRow>
                                               );
                                           })}
                                       </TableBody>
                                   </Table>
                               </div>
                           )}
                       </CardContent>
                  </Card>
            </TabsContent>

            {/* Tab 2: Book Lessons with Other Professors */}
            <TabsContent value="book-lessons">
                 <Card className="w-full">
                     <CardHeader>
                         <CardTitle>Prenota Lezioni con Altri Professori</CardTitle>
                         {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                             <CardDescription>Seleziona una data per visualizzare e prenotare slot disponibili con i professori a te assegnati ({assignedProfessorEmails.join(', ')}).</CardDescription>
                         ) : (
                             <CardDescription>Non ti è stato assegnato nessun professore per prenotare lezioni.</CardDescription>
                         )}
                     </CardHeader>
                     <CardContent className="grid gap-6 md:grid-cols-2">
                          {/* Calendar for Booking */}
                          <div className="flex justify-center">
                              <Calendar
                                  locale={it}
                                  mode="single"
                                  selected={selectedBookingDate}
                                  onSelect={setSelectedBookingDate}
                                  className="rounded-md border"
                                  disabled={(date) => isBefore(date, startOfDay(new Date()))} // Disable past dates
                              />
                          </div>
                         {/* Available Slots TO BOOK for selected date */}
                         <div>
                             <h3 className="text-lg font-semibold mb-3">Slot Disponibili per {selectedBookingDate ? format(selectedBookingDate, 'dd/MM/yyyy', { locale: it }) : 'Seleziona una data'}</h3>
                             {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                                 selectedBookingDate ? (
                                     filteredAvailableSlotsToBook.length === 0 ? (
                                         <p className="text-muted-foreground p-4 text-center">Nessuno slot disponibile per la prenotazione in questa data con i professori assegnati.</p>
                                     ) : (
                                         <div className="overflow-x-auto border rounded-md max-h-96">
                                             <Table>
                                                 <TableHeader><TableRow><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-28 text-center">Azioni</TableHead></TableRow></TableHeader>
                                                 <TableBody>
                                                     {filteredAvailableSlotsToBook.map((slot) => (
                                                         <TableRow key={`available-to-book-${slot.id}`}>
                                                             <TableCell>{slot.time}</TableCell>
                                                             <TableCell>{slot.classroom}</TableCell>
                                                             <TableCell>{slot.professorEmail}</TableCell>
                                                             <TableCell className="text-center">{slot.duration} min</TableCell>
                                                             <TableCell className="text-center">
                                                                 <Button onClick={() => bookLessonWithProfessor(slot)} size="sm">Prenota</Button>
                                                             </TableCell>
                                                         </TableRow>
                                                     ))}
                                                 </TableBody>
                                             </Table>
                                         </div>
                                     )
                                 ) : (
                                     <p className="text-muted-foreground p-4 text-center">Seleziona una data dal calendario per vedere gli slot disponibili.</p>
                                 )
                             ) : (
                                 <p className="text-muted-foreground p-4 text-center">Nessun professore assegnato.</p>
                             )}
                         </div>

                         {/* Lessons THIS Professor Booked WITH OTHERS */}
                         <div className="md:col-span-2"> {/* Span across both columns below the calendar/slots */}
                            <h3 className="text-lg font-semibold mb-3 mt-6">Le Tue Lezioni Prenotate (con altri)</h3>
                            {myBookedLessons.length === 0 ? (
                                 <p className="text-muted-foreground p-4 text-center">Non hai prenotato nessuna lezione con altri professori.</p>
                            ) : (
                                 <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                     <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Aula</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                       {myBookedLessons.map((slot) => {
                                         let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`my-booked-${slot.id}`}><TableCell colSpan={6}>Dati slot non validi</TableCell></TableRow>; }
                                         const isPastLesson = isBefore(lessonDateTime, new Date());
                                         const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                                         return (
                                           <TableRow key={`my-booked-${slot.id}`}>
                                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell>{slot.time}</TableCell>
                                             <TableCell>{slot.classroom}</TableCell>
                                             <TableCell>{slot.professorEmail}</TableCell>
                                             <TableCell className="text-center">{slot.duration} min</TableCell>
                                             <TableCell className="text-center">
                                              {isPastLesson ? (
                                                  <span className="text-muted-foreground italic">Lezione passata</span>
                                              ) : (
                                               <Button onClick={() => cancelLessonWithProfessor(slot)} variant="destructive" size="sm" disabled={!canCancel} title={!canCancel ? "Impossibile cancellare meno di 24 ore prima" : "Cancella questa prenotazione"}>Cancella Prenotazione</Button>
                                              )}
                                             </TableCell>
                                           </TableRow>
                                         );
                                       })}
                                     </TableBody>
                                   </Table>
                                 </div>
                            )}
                         </div>
                     </CardContent>
                 </Card>
            </TabsContent>
       </Tabs>
    </div>
  );
}
