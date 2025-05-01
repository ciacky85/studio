
// Define the structure for displaying user information in the UI
export interface DisplayUser {
  id: number;
  name: string;
  role: 'student' | 'professor' | 'admin'; // Explicitly include admin role
  email: string;
  assignedProfessorEmails?: string[] | null; // Array of emails or null
}
