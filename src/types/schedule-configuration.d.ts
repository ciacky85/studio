
import type { ClassroomSchedule } from './app-data';

// Define the structure for a saved schedule configuration
export interface ScheduleConfiguration {
  id: string; // Unique identifier (e.g., timestamp or UUID)
  name: string; // User-defined name for the configuration
  startDate: string; // 'YYYY-MM-DD' format
  endDate: string; // 'YYYY-MM-DD' format
  schedule: ClassroomSchedule; // The actual schedule grid saved for this configuration
}
