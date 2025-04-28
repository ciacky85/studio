
'use client';

import {useState, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Calendar} from '@/components/ui/calendar'; // Import Calendar
import {useToast} from "@/hooks/use-toast";
import { format, getDay, parseISO, startOfDay, isBefore, differenceInHours } from 'date-fns'; // Import date-fns functions
import { it } from 'date-fns/locale'; // Import Italian locale
import { cn } from "@/lib/utils"; // Import cn utility
import { Separator } from '@/components/ui/separator'; // Import Separator
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs
import type { UserData } from '@/types/user'; // Import UserData type
import { sendEmail } from '@/services/email'; // Import the email service
import { getCalendarLinksFromSlot } from '@/lib/calendar-utils'; // Import calendar utils


// Define the structure of a bookable slot (common structure)
interface BookableSlot {
  id: string; // Use 'YYYY-MM-DD-HH:00-professorEmail' as a unique identifier
  date: string; // 'YYYY-MM-DD' format
  day: string; // Day of the week (e.g., 'Monday')
  time: string; // Start time of the 60-min slot (e.g., '08:00')
  duration: number; // Now always 60 minutes
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student or Professor email if booked
  bookingTime: string | null; // ISO string timestamp of booking
  professorEmail: string; // Keep track of the professor offering the slot
}

// Define the structure of a slot as seen by the professor when booking from others
interface ProfessorBookingViewSlot {
  id: string; // Unique ID
  date: string; // 'YYYY-MM-DD'
  day: string; // Day of the week
  time: string; // Start time (e.g., '08:00')
  duration: number; // Always 60 min
  professorEmail: string; // The professor offering the slot
  isBookedByCurrentUser: boolean; // Whether the current professor booked this
  bookingTime: string | null; // ISO string, needed for cancellation check
}


// Key for storing all professors' availability (now date-specific slots) in localStorage
const ALL_PROFESSOR_AVAILABILITY_KEY = 'allProfessorAvailability';
// Key for admin-defined classroom schedule (hourly template)
const CLASSROOM_SCHEDULE_KEY = 'classroomSchedule';
// Key for logged-in user info
const LOGGED_IN_USER_KEY = 'loggedInUser';

// Add Saturday and Sunday
const daysOfWeek = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']; // Match getDay() output in Italian

export function ProfessorInterface() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()); // Default to today
  const [dailySlots, setDailySlots] = useState<BookableSlot[]>([]); // Slots this professor OFFERS for the selected date
  const [professorBookedSlots, setProfessorBookedSlots] = useState<BookableSlot[]>([]); // Slots THIS professor HAS BEEN BOOKED FOR
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [assignedProfessorEmails, setAssignedProfessorEmails] = useState<string[] | null>(null); // Professors this user can book FROM
  const [availableSlotsToBook, setAvailableSlotsToBook] = useState<ProfessorBookingViewSlot[]>([]); // Slots available for THIS professor TO BOOK
  const [myBookedLessons, setMyBookedLessons] = useState<ProfessorBookingViewSlot[]>([]); // Lessons THIS professor booked WITH OTHERS


  const {toast} = useToast();

  // Get current user email and assigned professors on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem(LOGGED_IN_USER_KEY);
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.role === 'professor') {
            setCurrentUserEmail(userData.username);
            // Get assigned professors from the professor's specific data
            const professorDataString = localStorage.getItem(userData.username);
            if(professorDataString) {
              const professorData: UserData = JSON.parse(professorDataString);
              // Ensure assignedProfessorEmail is treated as an array or null
              setAssignedProfessorEmails(Array.isArray(professorData.assignedProfessorEmail) ? professorData.assignedProfessorEmail : null);
            } else {
              console.warn("Dati specifici del professore non trovati per:", userData.username);
              setAssignedProfessorEmails(null);
            }
          } else {
            console.error("L'utente loggato non è un professore.");
            // Optionally redirect
          }
        } catch (e) {
          console.error("Errore durante il parsing dei dati utente:", e);
        }
      } else {
         console.error("Nessun utente loggato.");
         // Optionally redirect
      }
    }
  }, []);

   // Function to sort slots consistently by date then time (common helper)
   const sortSlotsByDateAndTime = <T extends { date: string; time: string }>(slots: T[]): T[] => {
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


  // Load/Generate slots for MANAGING OWN availability
  const loadAndGenerateOwnSlots = useCallback(() => {
    if (typeof window === 'undefined' || !currentUserEmail) {
      setDailySlots([]); // Clear slots if no user or on server
      setProfessorBookedSlots([]); // Clear booked slots as well
      return;
    }

    // 1. Load admin's hourly schedule template
    const storedSchedule = localStorage.getItem(CLASSROOM_SCHEDULE_KEY);
    let classroomSchedule: Record<string, string> = {};
    if (storedSchedule) { try { classroomSchedule = JSON.parse(storedSchedule); } catch (e) { console.error("Impossibile analizzare classroomSchedule", e); classroomSchedule = {}; }}

    // 2. Load all existing bookable slots
    const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
    let allProfessorAvailability: Record<string, BookableSlot[]> = {};
    if (storedAvailability) { try { allProfessorAvailability = JSON.parse(storedAvailability); } catch (e) { console.error("Impossibile analizzare allProfessorAvailability", e); allProfessorAvailability = {}; }}

    // Get the current professor's full list of slots (the ones they OFFER)
    const professorOfferedSlots = allProfessorAvailability[currentUserEmail] || [];


    // 3. Filter and sort slots where THIS professor WAS BOOKED
    const bookedForCurrentUser = professorOfferedSlots.filter(slot => slot && slot.bookedBy && slot.duration === 60);
    setProfessorBookedSlots(sortSlotsByDateAndTime([...bookedForCurrentUser])); // Set sorted list of lessons this professor GIVES


    // 4. Process slots for the *selected date* to manage availability
    if (!selectedDate) {
        setDailySlots([]);
        return; // No date selected, nothing to show in daily management view
    }

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = getDay(selectedDate);
    const dayOfWeekString = daysOfWeek[dayIndex];
    const isPastDate = isBefore(selectedDate, startOfDay(new Date()));

    // 5. Get existing slots specific to the current professor and selected date for lookup
    const professorExistingSlotsMap = new Map<string, BookableSlot>(
      professorOfferedSlots
        .filter(slot => slot && slot.date === formattedDate && slot.duration === 60)
        .map(slot => [slot.id, slot])
    );

    // 6. Generate potential 60-minute slots based ONLY on admin schedule assignments for this professor on the selected day
    const generatedSlots: BookableSlot[] = [];
    Object.entries(classroomSchedule).forEach(([hourlyKey, assignedEmail]) => {
      const [day, hourTime] = hourlyKey.split('-');
      if (day === dayOfWeekString && assignedEmail === currentUserEmail && hourTime.endsWith(':00')) {
        const slotId = `${formattedDate}-${hourTime}-${currentUserEmail}`;
        const existingSlotData = professorExistingSlotsMap.get(slotId);
        // Add slot only if it's not in the past or if it's already booked (to show its status)
        if (!isPastDate || existingSlotData?.bookedBy) {
            generatedSlots.push({
              id: slotId, date: formattedDate, day: dayOfWeekString, time: hourTime, duration: 60,
              // Availability is false for past slots unless explicitly set otherwise (e.g., if loaded from storage)
              isAvailable: isPastDate ? false : (existingSlotData?.isAvailable ?? false),
              bookedBy: existingSlotData?.bookedBy ?? null,
              bookingTime: existingSlotData?.bookingTime ?? null,
              professorEmail: currentUserEmail,
            });
        }
      }
    });

    // Sort the generated daily slots by time
    setDailySlots(sortSlotsByDateAndTime(generatedSlots));

  }, [selectedDate, currentUserEmail]); // Rerun when date or user changes

   // Load slots available FOR BOOKING by this professor
   const loadSlotsToBook = useCallback(() => {
       if (typeof window === 'undefined' || !currentUserEmail || !assignedProfessorEmails) {
           setAvailableSlotsToBook([]);
           setMyBookedLessons([]);
           return;
       }

       const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
       let allProfessorAvailability: Record<string, BookableSlot[]> = {};
       if (storedAvailability) { try { allProfessorAvailability = JSON.parse(storedAvailability); } catch (e) { console.error("Impossibile analizzare allProfessorAvailability", e); allProfessorAvailability = {}; } }

       const loadedAvailableToBook: ProfessorBookingViewSlot[] = [];
       const loadedMyBookings: ProfessorBookingViewSlot[] = [];
       const processedBookedIds = new Set<string>();

       // Iterate through ALL professors' slots
       Object.entries(allProfessorAvailability).forEach(([profEmail, slots]) => {
           // Only consider professors assigned to the current user, and exclude the user themselves
           if (assignedProfessorEmails.includes(profEmail) && profEmail !== currentUserEmail) {
               slots.forEach(slot => {
                   if (slot && slot.id && slot.date && slot.day && slot.time && typeof slot.isAvailable === 'boolean' && slot.professorEmail === profEmail && slot.duration === 60) {
                       const bookingViewSlot: ProfessorBookingViewSlot = {
                           id: slot.id, date: slot.date, day: slot.day, time: slot.time, duration: 60,
                           professorEmail: slot.professorEmail,
                           isBookedByCurrentUser: slot.bookedBy === currentUserEmail,
                           bookingTime: slot.bookingTime || null,
                       };

                       // Add to AVAILABLE TO BOOK list
                       if (slot.isAvailable && !slot.bookedBy) {
                           try {
                               const slotDateTime = parseISO(`${slot.date}T${slot.time}:00`);
                               if (!isBefore(slotDateTime, new Date())) {
                                   loadedAvailableToBook.push(bookingViewSlot);
                               }
                           } catch (parseError) { console.warn(`Impossibile analizzare data/ora per lo slot ${slot.id}:`, parseError); }
                       }
                   }
               });
           }
            // Check slots from ANY professor (even unassigned/self initially) if they are booked by the current user
            if (profEmail !== currentUserEmail) { // Avoid listing self-bookings in this list
                 slots.forEach(slot => {
                     if (slot && slot.id && slot.bookedBy === currentUserEmail && slot.duration === 60 && !processedBookedIds.has(slot.id)) {
                         const bookingViewSlot: ProfessorBookingViewSlot = {
                             id: slot.id, date: slot.date, day: slot.day, time: slot.time, duration: 60,
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

       setAvailableSlotsToBook(sortSlotsByDateAndTime(loadedAvailableToBook));
       setMyBookedLessons(sortSlotsByDateAndTime(loadedMyBookings));

   }, [currentUserEmail, assignedProfessorEmails]);


  // Trigger slot loading/generation on initial mount and when dependencies change
  useEffect(() => {
    loadAndGenerateOwnSlots(); // Load slots this professor offers
  }, [loadAndGenerateOwnSlots]);

  useEffect(() => {
    loadSlotsToBook(); // Load slots this professor can book from others
  }, [loadSlotsToBook]);


   // Save function (centralized for OWN availability) - ensures data for other dates/professors isn't lost
   const saveOwnAvailability = useCallback((updatedSlotsForDay: BookableSlot[]) => {
        if (typeof window !== 'undefined' && currentUserEmail && selectedDate) {
             const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
             let allProfessorAvailability: Record<string, BookableSlot[]> = {};
             if (storedAvailability) { try { allProfessorAvailability = JSON.parse(storedAvailability); } catch (e) { console.error("Impossibile analizzare allProfessorAvailability prima del salvataggio", e); allProfessorAvailability = {}; }}

             let currentProfessorSlots = allProfessorAvailability[currentUserEmail] || [];
             const formattedSelectedDate = format(selectedDate, 'yyyy-MM-dd');

             // Create a map of the updated slots for the current day for quick lookup
             // Filter out invalid slot data before creating the map
             const validUpdatedSlotsForDay = updatedSlotsForDay.filter(slot => slot && slot.id && slot.date && slot.time && slot.duration === 60);
             const updatedDaySlotMap = new Map(validUpdatedSlotsForDay.map(slot => [slot.id, slot]));


             // Filter out the old slots for the selected date and merge with the new ones
             const newProfessorSlots = currentProfessorSlots.filter(slot => slot && slot.date !== formattedSelectedDate);
             newProfessorSlots.push(...validUpdatedSlotsForDay); // Add all VALID slots for the current day (updated/new)


             // Filter out potentially invalid slots before sorting and saving
             const validatedSlots = newProfessorSlots.filter(slot => slot && slot.date && slot.time && slot.duration === 60);

             allProfessorAvailability[currentUserEmail] = sortSlotsByDateAndTime(validatedSlots);
             localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));
        }
   }, [currentUserEmail, selectedDate]); // Depends on currentUserEmail and selectedDate


  const toggleSlotAvailability = (id: string) => {
    const slotToToggle = dailySlots.find(slot => slot.id === id);
    if (!slotToToggle || !selectedDate) { console.error("Slot non trovato o data non selezionata:", id); return; }
    if (slotToToggle.bookedBy) {
       toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità di uno slot prenotato." });
       return;
    }
     // Prevent changing availability for past dates
     if (isBefore(selectedDate, startOfDay(new Date()))) {
          toast({ variant: "destructive", title: "Azione Negata", description: "Impossibile cambiare la disponibilità per date passate." });
          return;
     }

    const updatedSlot = { ...slotToToggle, isAvailable: !slotToToggle.isAvailable };
    const updatedDailySlots = dailySlots.map((slot) => slot.id === id ? updatedSlot : slot);
    setDailySlots(updatedDailySlots); // Update UI for the daily management view

    // Persist the change using the save function for OWN availability
    saveOwnAvailability(updatedDailySlots); // Pass all slots for the current day to ensure correct merging

    toast({ title: updatedSlot.isAvailable ? "Slot Reso Disponibile" : "Slot Reso Non Disponibile", description: `Slot alle ${slotToToggle.time} del ${format(selectedDate, 'dd/MM/yyyy', { locale: it })} è ora ${updatedSlot.isAvailable ? 'disponibile' : 'non disponibile'}.` });
  };

  // Function to cancel a booking MADE BY OTHERS for THIS professor's slots
  const cancelOwnBooking = useCallback(async (slotId: string) => {
    if (typeof window !== 'undefined' && currentUserEmail) {
        const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
        let allProfessorAvailability: Record<string, BookableSlot[]> = {};
        try { allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {}; } catch (e) {
            console.error("Errore analisi disponibilità:", e);
            toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati di disponibilità." });
            return;
         }

        let professorSlots = allProfessorAvailability[currentUserEmail];
        if (!professorSlots) {
            console.error("Slot professore non trovati per cancellazione:", currentUserEmail);
             toast({ variant: "destructive", title: "Errore", description: "Slot professore non trovati." });
             return;
        }

        const slotIndex = professorSlots.findIndex(s => s && s.id === slotId && s.duration === 60);
        if (slotIndex === -1) {
            console.error("Slot da cancellare non trovato:", slotId);
             toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o già cancellato." });
             loadAndGenerateOwnSlots(); // Refresh UI just in case
             return;
        }

        const slotToCancel = professorSlots[slotIndex];
        const bookerEmail = slotToCancel.bookedBy; // Student or Professor who booked
        if (!bookerEmail) { console.warn("Slot non prenotato, impossibile cancellare."); return; }

        // Prepare email details BEFORE updating the slot
        const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
        const formattedTime = slotToCancel.time;
        const eventTitle = `Lezione con Prof. ${currentUserEmail}`;
        const { deleteLink } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitle, eventTitle);


        // Update the slot to be available again
        const updatedSlot = { ...slotToCancel, bookedBy: null, bookingTime: null, isAvailable: true }; // Explicitly set isAvailable to true

        // Update the professor's slot list in memory
        professorSlots[slotIndex] = updatedSlot;

        // Save the entire updated availability object back to localStorage
        allProfessorAvailability[currentUserEmail] = professorSlots; // Update the specific professor's list
        localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));


        // Send cancellation emails
        try {
          // Email to the Booker (Student or Professor)
          await sendEmail({
            to: bookerEmail,
            subject: 'Lezione Cancellata dal Professore',
            html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata dal professore.</p>
                   <p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLink}">Rimuovi dal Calendario</a></p>`,
          });

          // Confirmation email to the Professor (optional, but good practice)
          await sendEmail({
            to: currentUserEmail, // Send to self
            subject: 'Conferma Cancellazione Lezione Effettuata',
            html: `<p>Ciao Prof. ${currentUserEmail},</p><p>Hai cancellato la prenotazione di ${bookerEmail} per il giorno ${formattedDate} alle ore ${formattedTime}. Lo slot è di nuovo disponibile.</p>`,
          });
        } catch (emailError) {
           console.error("Errore invio email di cancellazione (professore):", emailError);
           toast({
              variant: "destructive", // Warning
              title: "Avviso Invio Email",
              description: "Cancellazione completata, ma errore nell'invio delle notifiche email.",
              duration: 7000
           });
        }

        // Refresh UI states
        loadAndGenerateOwnSlots(); // Reloads dailySlots and professorBookedSlots
        loadSlotsToBook(); // Also refresh the booking tab

        toast({ title: "Prenotazione Cancellata", description: `Prenotazione da ${bookerEmail} per ${formattedDate} alle ${formattedTime} cancellata. Lo slot è di nuovo disponibile.` });
    }
  }, [currentUserEmail, loadAndGenerateOwnSlots, toast, loadSlotsToBook]); // Removed saveOwnAvailability dependency


  // --- Functions for Booking Lessons with OTHER Professors ---

  // Function to book a slot with another assigned professor
   const bookLessonWithProfessor = useCallback(async (slotToBook: ProfessorBookingViewSlot) => {
       if (typeof window !== 'undefined' && currentUserEmail) {
           // Check if the slot's professor is in the current user's assigned list
           if (!assignedProfessorEmails || !assignedProfessorEmails.includes(slotToBook.professorEmail)) {
               toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Puoi prenotare solo slot di professori a te assegnati." });
               loadSlotsToBook(); // Refresh booking list
               return;
           }

           const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
           let allProfessorAvailability: Record<string, BookableSlot[]> = {};
           try { allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {}; } catch (e) {
               console.error("Errore analisi disponibilità:", e);
               toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati di disponibilità." });
               return;
            }

           // Find the specific professor's list of slots (the one being booked FROM)
           const targetProfessorSlots = allProfessorAvailability[slotToBook.professorEmail];
           if (!targetProfessorSlots) {
               console.error("Slot professore target non trovati:", slotToBook.professorEmail);
               toast({ variant: "destructive", title: "Errore", description: "Slot professore non trovati." });
                return;
            }

           const slotIndex = targetProfessorSlots.findIndex(s => s && s.id === slotToBook.id && s.duration === 60);
           if (slotIndex === -1) {
                console.error("Slot da prenotare non trovato nella lista del professore target:", slotToBook.id);
                toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o non più valido." });
                loadSlotsToBook();
                return;
            }

           const originalSlot = targetProfessorSlots[slotIndex];

            // Check availability, not booked, not in the past
            let slotDateTime;
            try { slotDateTime = parseISO(`${originalSlot.date}T${originalSlot.time}:00`); } catch {
                 console.error("Errore analisi data/ora slot");
                 toast({ variant: "destructive", title: "Errore", description: "Formato data/ora slot non valido." });
                 return;
            }
            if (!originalSlot.isAvailable || originalSlot.bookedBy || isBefore(slotDateTime, new Date())) {
                toast({ variant: "destructive", title: "Prenotazione Fallita", description: "Lo slot non è più disponibile o è nel passato." });
                loadSlotsToBook();
                return;
            }

           // Update the slot
           originalSlot.bookedBy = currentUserEmail; // Booked by the current professor user
           originalSlot.bookingTime = new Date().toISOString();
           originalSlot.isAvailable = false; // Mark unavailable

           // Save the updated availability for the TARGET professor
           allProfessorAvailability[slotToBook.professorEmail] = targetProfessorSlots;
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // Prepare email details
            const formattedDate = format(parseISO(slotToBook.date), 'dd/MM/yyyy', { locale: it });
            const formattedTime = slotToBook.time;
            const eventTitleBooker = `Lezione con Prof. ${slotToBook.professorEmail}`;
            const eventTitleProfessor = `Lezione con Prof. ${currentUserEmail}`;
            const { addLink: addLinkBooker } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleBooker, eventTitleBooker, `Lezione prenotata con ${slotToBook.professorEmail}`);
            const { addLink: addLinkProfessor } = getCalendarLinksFromSlot(slotToBook.date, slotToBook.time, slotToBook.duration, eventTitleProfessor, eventTitleProfessor, `Lezione prenotata da ${currentUserEmail}`);


            // Send confirmation emails
            try {
              // Email to Booker (Current Professor)
              await sendEmail({
                to: currentUserEmail,
                subject: 'Conferma Prenotazione Lezione con Collega',
                html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToBook.professorEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è confermata.</p>
                       <p>Aggiungi al tuo calendario Google: <a href="${addLinkBooker}">Aggiungi al Calendario</a></p>`,
              });

              // Email to the Professor whose slot was booked
              await sendEmail({
                to: slotToBook.professorEmail,
                subject: 'Nuova Prenotazione Ricevuta da Collega',
                html: `<p>Ciao Prof. ${slotToBook.professorEmail},</p><p>Hai ricevuto una nuova prenotazione dal Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime}.</p>
                       <p>Aggiungi al tuo calendario Google: <a href="${addLinkProfessor}">Aggiungi al Calendario</a></p>`,
              });
            } catch (emailError) {
               console.error("Errore invio email di conferma (prof-prof):", emailError);
               toast({
                  variant: "destructive", // Warning
                  title: "Avviso Invio Email",
                  description: "Prenotazione completata, ma errore nell'invio delle notifiche email.",
                  duration: 7000
               });
            }

           // Refresh the lists related to booking lessons
           loadSlotsToBook(); // Reloads availableSlotsToBook and myBookedLessons

           toast({ title: "Prenotazione Riuscita", description: `Lezione con ${slotToBook.professorEmail} prenotata per il ${formattedDate} alle ${formattedTime}.` });
       }
   }, [currentUserEmail, assignedProfessorEmails, loadSlotsToBook, toast]);

   // Function to cancel a booking THIS professor made with ANOTHER professor
   const cancelLessonWithProfessor = useCallback(async (slotToCancel: ProfessorBookingViewSlot) => {
       if (typeof window !== 'undefined' && currentUserEmail) {

           // 24-hour cancellation check
           let lessonStartTime;
           try { lessonStartTime = parseISO(`${slotToCancel.date}T${slotToCancel.time}:00`); } catch {
               console.error("Errore analisi ora inizio lezione");
               toast({ variant: "destructive", title: "Errore", description: "Formato data/ora slot non valido." });
               return;
            }
           if (differenceInHours(lessonStartTime, new Date()) < 24) {
               toast({ variant: "destructive", title: "Cancellazione Fallita", description: "Impossibile cancellare meno di 24 ore prima.", duration: 5000 });
               return;
           }

           const storedAvailability = localStorage.getItem(ALL_PROFESSOR_AVAILABILITY_KEY);
           let allProfessorAvailability: Record<string, BookableSlot[]> = {};
           try { allProfessorAvailability = storedAvailability ? JSON.parse(storedAvailability) : {}; } catch (e) {
               console.error("Errore analisi disponibilità:", e);
                toast({ variant: "destructive", title: "Errore", description: "Impossibile caricare i dati di disponibilità." });
                return;
            }

           // Find the target professor's slot list
           const targetProfessorSlots = allProfessorAvailability[slotToCancel.professorEmail];
           if (!targetProfessorSlots) {
                console.error("Slot professore target non trovati per cancellazione:", slotToCancel.professorEmail);
                toast({ variant: "destructive", title: "Errore", description: "Slot professore non trovati." });
                return;
            }

           const slotIndex = targetProfessorSlots.findIndex(s => s && s.id === slotToCancel.id && s.duration === 60);
           if (slotIndex === -1) {
                console.error("Slot da cancellare non trovato nella lista del professore target:", slotToCancel.id);
                toast({ variant: "destructive", title: "Errore", description: "Slot non trovato o già cancellato." });
                loadSlotsToBook();
                return;
            }

           const originalSlot = targetProfessorSlots[slotIndex];

           // Verify the current user booked this slot
           if (originalSlot.bookedBy !== currentUserEmail) {
               console.warn("Tentativo di cancellare una prenotazione non effettuata dall'utente corrente.");
               toast({ variant: "destructive", title: "Errore", description: "Non puoi cancellare questa prenotazione." });
               loadSlotsToBook(); return;
            }

           // Update slot data
           originalSlot.bookedBy = null;
           originalSlot.bookingTime = null;
           originalSlot.isAvailable = true; // Make available again

           // Save updated data for the TARGET professor
           allProfessorAvailability[slotToCancel.professorEmail] = targetProfessorSlots;
           localStorage.setItem(ALL_PROFESSOR_AVAILABILITY_KEY, JSON.stringify(allProfessorAvailability));

           // Prepare email details
           const formattedDate = format(parseISO(slotToCancel.date), 'dd/MM/yyyy', { locale: it });
           const formattedTime = slotToCancel.time;
           const eventTitleBooker = `Lezione con Prof. ${slotToCancel.professorEmail}`;
           const eventTitleProfessor = `Lezione con Prof. ${currentUserEmail}`;
           const { deleteLink: deleteLinkBooker } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleBooker, eventTitleBooker);
           const { deleteLink: deleteLinkProfessor } = getCalendarLinksFromSlot(slotToCancel.date, slotToCancel.time, slotToCancel.duration, eventTitleProfessor, eventTitleProfessor);


           // Send cancellation emails
           try {
             // Email to Booker (Current Professor)
             await sendEmail({
               to: currentUserEmail,
               subject: 'Conferma Cancellazione Lezione con Collega',
               html: `<p>Ciao,</p><p>La tua lezione con il Prof. ${slotToCancel.professorEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p>
                      <p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkBooker}">Rimuovi dal Calendario</a></p>`,
             });

             // Email to the Professor whose slot was cancelled
             await sendEmail({
               to: slotToCancel.professorEmail,
               subject: 'Prenotazione Cancellata da Collega',
               html: `<p>Ciao Prof. ${slotToCancel.professorEmail},</p><p>La prenotazione del Prof. ${currentUserEmail} per il giorno ${formattedDate} alle ore ${formattedTime} è stata cancellata.</p>
                      <p>Puoi cercare e rimuovere l'evento dal tuo calendario Google cliccando qui: <a href="${deleteLinkProfessor}">Rimuovi dal Calendario</a></p>`,
             });
           } catch (emailError) {
             console.error("Errore invio email di cancellazione (prof-prof):", emailError);
              toast({
                 variant: "destructive", // Warning
                 title: "Avviso Invio Email",
                 description: "Cancellazione completata, ma errore nell'invio delle notifiche email.",
                 duration: 7000
              });
           }


           // Refresh the lists related to booking lessons
           loadSlotsToBook(); // Reloads availableSlotsToBook and myBookedLessons

           toast({ title: "Prenotazione Cancellata", description: `La tua lezione con ${slotToCancel.professorEmail} il ${formattedDate} alle ${formattedTime} è stata cancellata.` });
       }
   }, [currentUserEmail, loadSlotsToBook, toast]);


  return (
    <div className="flex flex-col gap-6 p-4 w-full">
       <Tabs defaultValue="manage-availability" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2"> {/* Reduced to 2 columns */}
                <TabsTrigger value="manage-availability">Gestisci Disponibilità</TabsTrigger>
                <TabsTrigger value="book-lessons">Prenota Lezioni con Altri Professori</TabsTrigger>
            </TabsList>

            {/* Tab 1: Manage Own Availability */}
            <TabsContent value="manage-availability">
                 <Card className="w-full">
                    <CardHeader>
                        <CardTitle>Gestisci la Tua Disponibilità</CardTitle>
                        <CardDescription>Seleziona una data per gestire i tuoi slot prenotabili da 60 minuti all'interno dei tuoi orari assegnati.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        <div className="flex justify-center">
                            <Calendar
                                locale={it} mode="single" selected={selectedDate} onSelect={setSelectedDate}
                                className="rounded-md border"
                                disabled={(date) => isBefore(date, startOfDay(new Date())) && !professorBookedSlots.some(slot => slot.date === format(date, 'yyyy-MM-dd'))} // Disable past dates unless booked
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-3">
                              Gestisci Slot per {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: it }) : 'Nessuna data selezionata'}
                            </h3>
                            {dailySlots.length === 0 ? (
                                <p className="text-muted-foreground p-4 text-center">
                                   {selectedDate ? (isBefore(selectedDate, startOfDay(new Date())) ? "Impossibile gestire slot per date passate (a meno che non siano già prenotate)." : `Nessuno slot orario da 60 minuti assegnato dall'admin per te il ${daysOfWeek[getDay(selectedDate)]}.`) : 'Seleziona una data per visualizzare gli slot.'}
                                </p>
                            ) : (
                                <div className="overflow-x-auto border rounded-md max-h-96">
                                  <Table>
                                    <TableHeader><TableRow><TableHead className="w-24">Ora</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Stato</TableHead><TableHead className="w-40 text-center">Azioni</TableHead><TableHead>Info Prenotazione</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                      {dailySlots.map((slot) => {
                                        const isBooked = !!slot.bookedBy;
                                        const isPastSlot = selectedDate ? isBefore(selectedDate, startOfDay(new Date())) : false; // Check if the slot's date is past
                                        const isPast = isPastSlot && !isBooked; // Consider it past only if not booked
                                        const statusText = isBooked ? 'Prenotato' : (slot.isAvailable ? 'Disponibile per Prenotazione' : 'Non Disponibile');
                                        const statusColor = isBooked ? 'text-gray-500' : (slot.isAvailable ? 'text-green-600' : 'text-red-600');


                                        return (
                                          <TableRow key={slot.id}>
                                            <TableCell>{slot.time}</TableCell>
                                            <TableCell className="text-center">{slot.duration} min</TableCell>
                                            <TableCell className={`${statusColor} font-medium`}>{statusText}</TableCell>
                                            <TableCell className="text-center">
                                                 {isBooked ? (
                                                      <span className="text-muted-foreground font-normal px-1 italic">Prenotato</span>
                                                 ) : isPast ? (
                                                      <span className="text-muted-foreground font-normal px-1 italic">Passato</span>
                                                 ) : (
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
                                                         {slot.isAvailable ? 'Rendi Non Disponibile' : 'Rendi Disponibile'}
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
                                       <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead>Prenotato Da</TableHead><TableHead>Ora Prenotazione</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                       <TableBody>
                                           {professorBookedSlots.map((slot) => {
                                               if (!slot || !slot.id) return null; // Basic check
                                                let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`booked-prof-${slot.id}`}><TableCell colSpan={6}>Dati slot non validi</TableCell></TableRow>; }
                                                const isPastLesson = isBefore(lessonDateTime, new Date());
                                               return (
                                                   <TableRow key={`booked-prof-${slot.id}`}>
                                                       <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                       <TableCell>{slot.time}</TableCell>
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

            {/* Tab 2: Book Lessons with Other Professors (was Tab 3) */}
            <TabsContent value="book-lessons">
                 <Card className="w-full">
                     <CardHeader>
                         <CardTitle>Prenota Lezioni con Altri Professori</CardTitle>
                         {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                             <CardDescription>Visualizza e prenota slot disponibili con i professori a te assegnati ({assignedProfessorEmails.join(', ')}).</CardDescription>
                         ) : (
                             <CardDescription>Non ti è stato assegnato nessun professore per prenotare lezioni.</CardDescription>
                         )}
                     </CardHeader>
                     <CardContent className="grid gap-6">
                         {/* Available Slots TO BOOK */}
                         <div>
                             <h3 className="text-lg font-semibold mb-3">Slot Disponibili per la Prenotazione</h3>
                             {(assignedProfessorEmails && assignedProfessorEmails.length > 0) ? (
                                 availableSlotsToBook.length === 0 ? (
                                     <p className="text-muted-foreground p-4 text-center">Nessuno slot attualmente disponibile per la prenotazione con i professori assegnati.</p>
                                 ) : (
                                     <div className="overflow-x-auto border rounded-md max-h-96">
                                         <Table>
                                             <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-28 text-center">Azioni</TableHead></TableRow></TableHeader>
                                             <TableBody>
                                                 {availableSlotsToBook.map((slot) => (
                                                     <TableRow key={`available-to-book-${slot.id}`}>
                                                         <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                                         <TableCell>{slot.time}</TableCell>
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
                                 <p className="text-muted-foreground p-4 text-center">Nessun professore assegnato.</p>
                             )}
                         </div>

                         {/* Lessons THIS Professor Booked WITH OTHERS */}
                         <div>
                            <h3 className="text-lg font-semibold mb-3 mt-6">Le Tue Lezioni Prenotate (con altri)</h3>
                            {myBookedLessons.length === 0 ? (
                                 <p className="text-muted-foreground p-4 text-center">Non hai prenotato nessuna lezione con altri professori.</p>
                            ) : (
                                 <div className="overflow-x-auto border rounded-md max-h-96">
                                   <Table>
                                     <TableHeader><TableRow><TableHead className="w-32">Data</TableHead><TableHead className="w-24">Ora</TableHead><TableHead>Professore</TableHead><TableHead className="w-20 text-center">Durata</TableHead><TableHead className="w-40 text-center">Azioni</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                       {myBookedLessons.map((slot) => {
                                         let lessonDateTime; try { lessonDateTime = parseISO(`${slot.date}T${slot.time}:00`); } catch { return <TableRow key={`my-booked-${slot.id}`}><TableCell colSpan={5}>Dati slot non validi</TableCell></TableRow>; }
                                         const isPastLesson = isBefore(lessonDateTime, new Date());
                                         const canCancel = !isPastLesson && differenceInHours(lessonDateTime, new Date()) >= 24;
                                         return (
                                           <TableRow key={`my-booked-${slot.id}`}>
                                             <TableCell>{format(parseISO(slot.date), 'dd/MM/yyyy', { locale: it })}</TableCell>
                                             <TableCell>{slot.time}</TableCell>
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

