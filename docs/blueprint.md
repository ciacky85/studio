# **App Name**: Classroom Scheduler

## Core Features:

- User Authentication: User authentication and role management (admin, professor, student).
- Admin Interface: Admin interface to approve user registration and manage available classrooms and timeslots.
- Professor Slot Management: Professor interface to create bookable slots for students based on admin-defined availability. Slots can be 30 or 60 minutes long.
- Student Booking: Student interface to view available slots and book a lesson.
- AI Slot Suggestion: AI-powered suggestion tool to suggest optimal slot times for professors based on student demand and classroom availability, to maximize booking efficiency. Uses a tool.
- Automated Notifications: Automated email confirmations for bookings and cancellations with details on time and location.
- Booking Cancellation: Cancellation of bookings up to 24 hours in advance, with automated notifications to both professor and student.

## Style Guidelines:

- Primary color: Deep blue (#1A237E) for a professional look.
- Secondary color: Light gray (#EEEEEE) for backgrounds.
- Accent: Teal (#00BCD4) for interactive elements and highlights.
- Clean and readable sans-serif fonts for all text.
- Consistent and professional icon set for navigation and actions.
- Clear, structured layout with a focus on usability and accessibility.
- Subtle transitions and animations to enhance user experience.

## Original User Request:
Voglio una applicazione che gestisca il mio calendario delle lezioni. Deve essere composta da una pagina di registrazione e autenticazione che da accesso a tre tipi di interfacce. Interfaccia admin: puoi approvare la registrazione di studenti e professori. Interfaccia professore: permette di mettere a disposizione dello studente delle lezioni da 30minuti o 60 minuti partendo da una base di disponibilità di aule fornita dall'amministratore. Ad esempio Paolo, professore, ha disponibilità fornita dall'admin di 2ore alle 8 del mattino del lunedì in aula 1 e 3 ore dalle 17 del martedì in aula 2. Il professore deve poter generare degli slot visibili agli studenti solo all'interno delle possibilità assegnate dall'admin. Poi un accesso studente che vede gli slot resi pubblici dalli professori e può prenotarsi. Voglio anche che quando uno studente prenota una lezione, arrivi una mail di conferma con orario e sala sia al professore che allo studente. Deve anche poter cancellare la prenotazione fino a 24ore prima con email di conferma cancellazione sia al professore che allo studente
  