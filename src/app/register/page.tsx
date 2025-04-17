'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useRouter} from 'next/navigation';
import {sendEmail} from '@/services/email'; // Import the email service
import {useToast} from "@/hooks/use-toast";

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'professor' | ''>('');
  const router = useRouter();
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const {toast} = useToast();

  const handleRegister = async () => {
    setRegistrationStatus('pending');
    try {
      if (!email || !password || !role) {
        throw new Error('Please fill in all fields.');
      }

      // Simulate registration processing (e.g., Firebase auth, Firestore update)
      // await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network request

      // Simulate success
      console.log('Registering user:', {email, password, role});

      // Send notification email to the admin (replace with actual admin email)
      await sendEmail({
        to: 'carlo.checchi@gmail.com',
        subject: 'New User Registration',
        html: `<p>A new user has registered with the email: ${email} and role: ${role}. Please review and approve.</p>`,
      });

      setRegistrationStatus('success');
      toast({
        title: "Registration Successful",
        description: "Your registration has been submitted and is pending admin approval.",
      });

      router.push('/'); // Redirect to home page after registration

    } catch (error: any) {
      console.error('Registration failed:', error);
      setRegistrationStatus('error');
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "There was an error during registration. Please try again.",
      });
    } finally {
      // Reset the registration status to 'idle' after a delay
      setRegistrationStatus('idle');
    }
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
              disabled={registrationStatus === 'pending'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="password">Password</label>
            <Input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={registrationStatus === 'pending'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="role">Role</label>
            <Select
              onValueChange={(value) => setRole(value as 'student' | 'professor' | '')}
              disabled={registrationStatus === 'pending'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="professor">Professor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleRegister} disabled={registrationStatus === 'pending'}>
            {registrationStatus === 'pending' ? 'Registering...' : 'Register'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
