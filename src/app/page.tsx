'use client';

import {useState, useEffect} from 'react';
import {AdminInterface} from '@/components/admin/admin-interface';
import {ProfessorInterface} from '@/components/professor/professor-interface';
import {StudentInterface} from '@/components/student/student-interface';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
// import ClientHeader from '@/components/ClientHeader'; // Remove import - Handled by RootLayout

export default function Home() {
  const [role, setRole] = useState<'admin' | 'professor' | 'student' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const router = useRouter();

  // Function to check login status and update role state
  const checkLoginAndSetRole = () => {
     if (typeof window !== 'undefined') {
       const storedUser = localStorage.getItem('loggedInUser');
       if (storedUser) {
         try {
           const userData = JSON.parse(storedUser);
           setRole(userData.role);
         } catch (e) {
           console.error("Error parsing stored user data:", e);
           localStorage.removeItem('loggedInUser'); // Clear invalid data
           setRole(null);
         }
       } else {
         setRole(null); // Ensure role is null if not logged in
       }
     }
   };

   useEffect(() => {
     checkLoginAndSetRole(); // Check on initial load

     // Listen for storage changes to update UI if logged in/out from another tab
     const handleStorageChange = (event: StorageEvent) => {
        if (event.key === 'loggedInUser' || event.key === null) { // Also update if storage is cleared
             checkLoginAndSetRole();
        }
     };
     window.addEventListener('storage', handleStorageChange);
     return () => window.removeEventListener('storage', handleStorageChange);

   }, []); // Run only on mount

   // Re-check role if the path changes back to '/' (e.g., after logout)
   useEffect(() => {
        if (typeof window !== 'undefined' && window.location.pathname === '/') {
            checkLoginAndSetRole();
        }
   }, [typeof window !== 'undefined' ? window.location.pathname : '']);


  const handleLogin = () => {
    setLoginError(null); // Clear any previous error

    // Declare variables outside the if block
    let userFound = false;
    let correctPassword = false;
    let userRole: 'admin' | 'professor' | 'student' | null = null;
    let userApproved = false;

    if (typeof window !== 'undefined') {
      // Check registered users in localStorage
      const storedUser = localStorage.getItem(username);


      // Handle hardcoded admin login first
      if (username === 'carlo.checchi@gmail.com' && password === '8257619t') {
          userFound = true;
          correctPassword = true;
          userRole = 'admin';
          userApproved = true; // Hardcoded admin is always approved
      } else if (storedUser) { // Check localStorage for other users
        try {
          const userData = JSON.parse(storedUser);
          if (userData.password === password) {
              userFound = true;
              correctPassword = true;
              userRole = userData.role;
              // Ensure approved status is checked correctly (true or missing vs explicitly false)
              userApproved = userData.approved !== false;
          } else {
              userFound = true; // User exists, but password wrong
              correctPassword = false;
          }
        } catch (error) {
          console.error("Error parsing user data from localStorage:", error);
          // Treat as invalid login attempt if parsing fails
        }
      }

      // Handle login based on findings
      if (userFound && correctPassword && userApproved) {
        setRole(userRole);
        localStorage.setItem('loggedInUser', JSON.stringify({username: username, role: userRole}));
        // No need to push, role change triggers re-render
      } else if (userFound && correctPassword && !userApproved) {
        setLoginError('Account not yet approved by admin.');
      } else if (userFound && !correctPassword) {
        setLoginError('Invalid credentials.');
      }
      else {
        setLoginError('Invalid credentials or user not found.');
      }
    }

    // Clear password field on error to allow retries easily, keep username
    // Now this check can safely access the variables
    if (loginError || !(userFound && correctPassword && userApproved)) { // Clear password if any error occurs
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
              <CardTitle>Login</CardTitle>
              <CardDescription>Enter your credentials to access the application.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="username">Username (Email)</label>
                <Input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setLoginError(null); }} // Clear error on input change
                  placeholder="your.email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="password">Password</label>
                <Input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(null); }} // Clear error on input change
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive">{loginError}</p>
              )}
              <Button onClick={handleLogin}>Login</Button>
              <Link href="/register" className="w-full">
                <Button variant="outline" className="w-full">Register</Button>
              </Link>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <>
      {/* <ClientHeader /> */} {/* Remove ClientHeader rendering here */}
      <main className="flex flex-grow flex-col items-center justify-center p-4 sm:p-12 md:p-24">
        {renderInterface()}
      </main>
    </>
  );
}
