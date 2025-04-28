export interface UserData {
  role: 'student' | 'professor' | 'admin';
  approved: boolean;
  assignedProfessorEmail?: string[] | null; // Changed to array of strings or null
  password?: string; // Ensure password field is optionally present for type safety during parsing
  // Add other user-related properties if needed
}
