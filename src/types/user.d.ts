export interface UserData {
  role: 'student' | 'professor' | 'admin';
  approved: boolean;
  assignedProfessorEmail?: string | null; // Optional: Store assigned professor for students
  password?: string; // Ensure password field is optionally present for type safety during parsing
  // Add other user-related properties if needed
}
