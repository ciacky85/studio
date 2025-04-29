
// Represents the data structure for a single user stored in the users data file.
export interface UserData {
  role: 'student' | 'professor' | 'admin'; // User's role
  approved: boolean; // Approval status set by admin
  assignedProfessorEmail?: string[] | null; // Array of assigned professor emails or null
  password?: string; // Password (consider hashing in production)
  // Add other user-specific properties if needed, e.g., name, registration date etc.
  // Example: name?: string;
}

// Structure for storing all user data (indexed by email)
// Added here to resolve persistent compilation errors, even though conceptually
// it might belong in app-data.d.ts
export interface AllUsersData {
  [email: string]: UserData;
}
