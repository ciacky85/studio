
import type { UserData } from './user';
import type { BookableSlot } from './bookable-slot'; // Assuming this type exists
import type { ScheduleAssignment } from './schedule-assignment'; // Assuming this type exists

// Structure for the users.json file
export interface AllUsersData {
    [email: string]: UserData;
}

// Structure for the allProfessorAvailability.json file
export interface AllProfessorAvailabilityData {
    [professorEmail: string]: BookableSlot[];
}

// Structure for the classroomSchedule.json file
export interface ClassroomScheduleData {
    [scheduleKey: string]: ScheduleAssignment; // key: "Day-Time-Classroom"
}
