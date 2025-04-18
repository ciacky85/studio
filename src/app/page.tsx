'use client';

import {useState} from 'react';
import {AdminInterface} from '@/components/admin/admin-interface';
import {ProfessorInterface} from '@/components/professor/professor-interface';
import {StudentInterface} from '@/components/student/student-interface';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import Link from 'next/link';

export default function Home() {
  const [role, setRole] = useState<'admin' | 'professor' | 'student' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = () => {
    // Placeholder for authentication logic
    setLoginError(null); // Clear any previous error

    //Check registered users in localStorage
    const storedUser = localStorage.getItem(username);
    if(storedUser){
      try{
        const userData = JSON.parse(storedUser);
        if(userData.password === password){
          setRole(userData.role);
          return;
        } else {
          setLoginError('Invalid credentials');
        }
      } catch (error) {
        console.error("Error parsing user data from localStorage:", error);
        setLoginError('Invalid credentials');
        
      }
    } else {
      // Existing Admin user authentication
      if (username === 'admin' && password === 'admin') {
        setRole('admin');
      } else if (username === 'professor' && password === 'professor') {
        setRole('professor');
      } else if (username === 'student' && password === 'student') {
        setRole('student');
      } else if (username === 'carlo.checchi@gmail.com' && password === '8257619t') {
        setRole('admin');
      } else {
        setLoginError('Invalid credentials');
      }
    }

    if (loginError) {
      setUsername('');
      setPassword('');
      alert(loginError);
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
        return (
          <Card className="w-[400px] p-4">
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>Enter your credentials to access the application.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="username">Username</label>
                <Input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="password">Password</label>
                <Input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleLogin}>Login</Button>
              <Link href="/register">
                <Button variant="outline">Register</Button>
              </Link>
              {loginError && (
                  <p className="text-red-500">{loginError}</p>
              )}
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      {renderInterface()}
    </main>
  );
}


