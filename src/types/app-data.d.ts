
import type { UserData } from './user';
import type { BookableSlot } from './schedule'; // Use unified schedule type
import type { ScheduleAssignment } from './schedule'; // Use unified schedule type
import type { ScheduleConfiguration } from './schedule-configuration';

// Structure for the users.json file
export interface AllUsersData {
    [email: string]: UserData;
}

// Structure for the availability.json file
// Key can be professor email or the GUEST_IDENTIFIER
export interface AllProfessorAvailability {
    [professorIdentifier: string]: BookableSlot[];
}

// Structure for the schedule.json file (used for current editing)
export interface ClassroomSchedule {
    [scheduleKey: string]: ScheduleAssignment; // key: "Day-Time-Classroom"
}

// Structure for the scheduleConfigurations.json file
export type AllScheduleConfigurations = ScheduleConfiguration[];
