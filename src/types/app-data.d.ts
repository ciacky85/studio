
import type { UserData } from './user';
import type { BookableSlot, ScheduleAssignment } from './schedule'; // Use unified schedule type

// Structure for the users.json file
export interface AllUsersData {
    [email: string]: UserData;
}

// Structure for the availability.json file
// Key can be professor email or the GUEST_IDENTIFIER
export interface AllProfessorAvailability {
    [professorIdentifier: string]: BookableSlot[];
}

// Structure for the weeklySchedule.json file
// Key: 'YYYY-MM-DD'
// Value: Object mapping 'HH:MM-Classroom' to ScheduleAssignment
export interface DailyScheduleAssignments {
    [timeClassroomKey: string]: ScheduleAssignment;
}

export interface WeeklyScheduleData {
    [dateKey: string]: DailyScheduleAssignments;
}
