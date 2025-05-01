
// Represents the data structure for a single user stored in the users data file.

export interface UserData {
  role: 'student' | 'professor' | 'admin'; // User's role
  approved: boolean; // Approval status set by admin
  assignedProfessorEmail?: string[] | null; // Array of assigned professor emails or null
  password?: string; // Password (consider hashing in production)

}

export interface AllUsersData {
  [email: string]: UserData;
  // Add other user-specific properties if needed, e.g., name, registration date etc.
  // Example: name?: string;
}