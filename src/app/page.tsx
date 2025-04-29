
'use client';

import {useState, useEffect} from 'react';
import {AdminInterface} from '@/components/admin/admin-interface';
import {ProfessorInterface} from '@/components/professor/professor-interface';
import {StudentInterface} from '@/components/student/student-interface';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation';
import { readData } from '@/services/data-storage';
// Correctly import types from their respective files
import type { AllUsersData } from '@/types/app-data';
import type { UserData } from '@/types/user';

// Constants for filenames and keys
const USERS_DATA_FILE = 'users'; // Stores all users
const LOGGED_IN_USER_KEY = 'loggedInUser'; // Keep using localStorage for session state

export default function Home() {
  const [role, setRole] = useState<'admin' | 'professor' | 'student' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Function to check login status from localStorage and update role state
  const checkLoginAndSetRole = () => {
     if (typeof window !== 'undefined') {
       const storedUserSession = localStorage.getItem(LOGGED_IN_USER_KEY);
       if (storedUserSession) {
         try {
           const userSessionData = JSON.parse(storedUserSession);
           setRole(userSessionData.role);
         } catch (e) {
           console.error("Errore durante il parsing dei dati di sessione:", e);
           localStorage.removeItem(LOGGED_IN_USER_KEY); // Clear invalid data
           setRole(null);
         }
       } else {
         setRole(null); // Ensure role is null if not logged in
       }
     }
   };

   useEffect(() => {
     checkLoginAndSetRole(); // Check on initial load

     // Listen for storage changes (for session state)
     const handleStorageChange = (event: StorageEvent) => {
        if (event.key === LOGGED_IN_USER_KEY || event.key === null) {
             checkLoginAndSetRole();
        }
     };
     window.addEventListener('storage', handleStorageChange);
     return () => window.removeEventListener('storage', handleStorageChange);

   }, []); // Run only on mount

   // Re-check role if the path changes back to '/' (e.g., after logout)
   useEffect(() => {
        if (pathname === '/') {
            checkLoginAndSetRole();
        }
   }, [pathname]);


  const handleLogin = async () => {
    setLoginError(null);

    let userFound = false;
    let correctPassword = false;
    let userRole: 'admin' | 'professor' | 'student' | null = null;
    let userApproved = false;

    // Handle hardcoded admin login first
    if (username === 'carlo.checchi@gmail.com' && password === '8257619t') {
        userFound = true;
        correctPassword = true;
        userRole = 'admin';
        userApproved = true; // Hardcoded admin is always approved
    } else {
      // Read all users data from the file
      // Explicitly type allUsers with the correctly imported AllUsersData
      const allUsers: AllUsersData = await readData<AllUsersData>(USERS_DATA_FILE, {});
      const userData = allUsers[username]; // Find user by email (username)

      if (userData) {
          userFound = true;
          if (userData.password === password) {
              correctPassword = true;
              userRole = userData.role;
              // Ensure approved status is checked correctly (true or explicitly true vs false/missing)
               userApproved = userData.approved === true; // Check for explicit true
          } else {
              correctPassword = false;
          }
      }
    }

    // Handle login based on findings
    if (userFound && correctPassword && userApproved) {
        setRole(userRole);
        // Still use localStorage for the *session* state
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOGGED_IN_USER_KEY, JSON.stringify({ username: username, role: userRole }));
        }
        // No need to push, role change triggers re-render
    } else if (userFound && correctPassword && !userApproved) {
        setLoginError('Account non ancora approvato dall\'amministratore.');
    } else if (userFound && !correctPassword) {
        setLoginError('Credenziali non valide.');
    } else {
        setLoginError('Credenziali non valide o utente non trovato.');
    }


    // Clear password field only if login fails or error occurs
    if (loginError || !(userFound && correctPassword && userApproved)) {
      // Clear password if any error occurs
      setPassword('');
    }
};


  const renderInterface = () => {
    switch (role) {
      case 'admin':
        return <AdminInterface />;
      case 'professor':
        return <ProfessorInterface />;
      case 'student':
        return <StudentInterface />;
      default:
        // Login Form
        return (
          <Card className="w-full max-w-md p-4">
            <CardHeader>
              <CardTitle>Creative Academy Booking</CardTitle> {/* Updated Title */}
              <CardDescription>Inserisci le tue credenziali per accedere all'applicazione.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="username">Username (Email)</label>
                <Input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setLoginError(null); }}
                  placeholder="tua.email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="password">Password</label>
                <Input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive">{loginError}</p>
              )}
              <Button onClick={handleLogin}>Login</Button>
              <Link href="/register" className="w-full">
                <Button variant="outline" className="w-full">Registrati</Button>
              </Link>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <>
      {/* ClientHeader is handled by RootLayout */}
      <main className="flex flex-grow flex-col items-center justify-center p-4 sm:p-12 md:p-24">
        {renderInterface()}
      </main>
    </>
  );
}
