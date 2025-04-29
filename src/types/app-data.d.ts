
import type { UserData } from './user';
import type { BookableSlot, ScheduleAssignment } from './schedule'; // Assuming schedule types are defined here or create the file

// Structure for storing all user data (indexed by email)
export interface AllUsersData {
  [email: string]: UserData;
}

// Structure for storing all professor availability (indexed by professor email)
export interface AllProfessorAvailability {
  [professorEmail: string]: BookableSlot[];
}

// Structure for storing the classroom schedule assignments (indexed by Day-Time-Classroom)
export interface ClassroomSchedule {
  [scheduleKey: string]: ScheduleAssignment;
}

// You might combine these into a single AppData structure if saving to one file,
// or keep them separate if saving to different files (users.json, availability.json, schedule.json).
// Example of combined structure (if using one file):
// export interface AppData {
//   users: AllUsersData;
//   availability: AllProfessorAvailability;
//   schedule: ClassroomSchedule;
// }
