
import type { UserData } from './user';
import type { BookableSlot } from './bookable-slot'; // Assuming this type exists
import type { ScheduleAssignment } from './schedule-assignment'; // Assuming this type exists
import type { ScheduleConfiguration } from './schedule-configuration'; // Import ScheduleConfiguration

// Structure for the users.json file
export interface AllUsersData {
    [email: string]: UserData;
}

// Structure for the allProfessorAvailability.json file
export interface AllProfessorAvailability {
    [professorEmail: string]: BookableSlot[];
}

// Structure for the classroomSchedule.json file (used for current editing)
export interface ClassroomSchedule {
    [scheduleKey: string]: ScheduleAssignment; // key: "Day-Time-Classroom"
}

// Structure for the scheduleConfigurations.json file
export type AllScheduleConfigurations = ScheduleConfiguration[];
