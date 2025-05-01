
// Defines the structure of a bookable slot used across different interfaces
export interface BookableSlot {
  id: string; // Unique identifier, e.g., 'YYYY-MM-DD-HH:00-ClassroomName-professorEmail'
  date: string; // 'YYYY-MM-DD' format
  day: string; // Day of the week (e.g., 'Lunedì')
  time: string; // Start time of the slot (e.g., '08:00')
  classroom: string; // Name of the classroom
  duration: number; // Duration in minutes (e.g., 60)
  isAvailable: boolean; // Whether the professor marked it as available
  bookedBy: string | null; // Email of the student or professor who booked, or null
  bookingTime: string | null; // ISO string timestamp of booking, or null
  professorEmail: string; // Email of the professor offering the slot OR 'GUEST'
}

// Defines the structure for an admin's assignment in the classroom schedule
export interface ScheduleAssignment {
  professor: string; // Professor email assigned, or '' if unassigned, or 'ospite@creativeacademy.it'
}

// Defines the structure of a slot from the perspective of a user (student/professor) booking it
export interface BookingViewSlot {
  id: string;
  date: string;
  day: string;
  time: string;
  classroom: string;
  duration: number;
  professorEmail: string; // The professor offering the slot
  isBookedByCurrentUser: boolean; // Whether the current logged-in user booked this
  bookingTime: string | null; // Needed for cancellation logic
}