
// Define the structure of a bookable slot (common structure)
export interface BookableSlot {
  id: string; // Use 'YYYY-MM-DD-HH:00-ClassroomName-professorEmail' as a unique identifier
  date: string; // 'YYYY-MM-DD' format
  day: string; // Day of the week (e.g., 'Monday')
  time: string; // Start time of the 60-min slot (e.g., '08:00')
  classroom: string; // Added classroom
  duration: number; // Now always 60 minutes
  isAvailable: boolean; // Professor sets this for student booking
  bookedBy: string | null; // Student or Professor email if booked
  bookingTime: string | null; // ISO string timestamp of booking
  professorEmail: string; // Keep track of the professor offering the slot
}
