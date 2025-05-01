
// Define the structure for storing user data persistently
export interface UserData {
  email: string; // Use email as the primary identifier
  password?: string; // Store hashed password in production
  role: 'student' | 'professor' | 'admin';
  approved: boolean;
  // Allow assigned professors for both students and professors
  assignedProfessorEmails?: string[] | null; // Changed field name for clarity
  // Add other user-related properties if needed
}
