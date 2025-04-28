export interface UserData {
  role: 'student' | 'professor' | 'admin';
  approved: boolean;
  // Allow assigned professors for both students and professors
  assignedProfessorEmail?: string[] | null;
  password?: string; // Ensure password field is optionally present for type safety during parsing
  // Add other user-related properties if needed
}
