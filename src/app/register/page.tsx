'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useRouter} from 'next/navigation';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'professor' | ''>('');
  const router = useRouter();

  const handleRegister = async () => {
    // Placeholder for registration logic - replace with Firebase or similar
    // Here you would:
    // 1. Create the user in Firebase Auth
    // 2. Add user details to Firebase Firestore (including the role)
    // 3. Send a notification email to the admin

    // For now, let's just simulate the registration and redirect
    console.log('Registering user:', {email, password, role});
    alert('Registration successful! An admin needs to approve your registration.');
    router.push('/'); // Redirect to home page after registration
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-[400px] p-4">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Create an account to access the application.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="email">Email</label>
            <Input
              type="email"
              id="email"
              placeholder="example@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          <div className="grid gap-2">
            <label htmlFor="role">Role</label>
            <Select onValueChange={(value) => setRole(value as 'student' | 'professor')}>
              <SelectTrigger>
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="professor">Professor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleRegister}>Register</Button>
        </CardContent>
      </Card>
    </main>
  );
}
