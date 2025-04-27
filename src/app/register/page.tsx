'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useRouter} from 'next/navigation';
import {sendEmail} from '@/services/email'; // Import the email service
import {useToast} from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster


export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'professor' | ''>('');
  const router = useRouter();
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const {toast} = useToast();

  const isFormValid = email && password && role;

  const handleRegister = async () => {
    setRegistrationStatus('pending');
    try {
      if (!isFormValid) { // Use the derived state for validation
        throw new Error('Please fill in all fields.');
      }

      // Simulate registration processing (e.g., Firebase auth, Firestore update)
      // await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network request

      // Simulate success
      console.log('Registering user:', {email, password, role});

      //Here, simulate user creation by setting a localStorage entry to match authentication function
      // Check if user already exists
      if (localStorage.getItem(email)) {
          throw new Error('User with this email already exists.');
      }

      localStorage.setItem(email, JSON.stringify({password, role, approved: false})); // Add approved: false flag


      // Send notification email to the admin (replace with actual admin email)
      await sendEmail({
        to: 'carlo.checchi@gmail.com', // Consider making this configurable
        subject: 'New User Registration Pending Approval',
        html: `<p>A new user has registered and requires approval:</p><ul><li>Email: ${email}</li><li>Role: ${role}</li></ul><p>Please log in to the admin panel to approve or reject.</p>`,
      });


      setRegistrationStatus('success');
      toast({
        title: "Registration Submitted",
        description: "Your registration requires admin approval. You will be notified once approved.",
      });

      // Optionally clear form fields after successful submission
      // setEmail('');
      // setPassword('');
      // setRole('');

      // Redirect after a short delay to allow the user to see the message
       setTimeout(() => router.push('/'), 2000);

    } catch (error: any) {
      console.error('Registration failed:', error);
      setRegistrationStatus('error');
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
      });
       // Keep status as error until user interacts again
       setRegistrationStatus('error'); // Explicitly set to error

    } finally {
      // Only reset to idle if it wasn't an error, otherwise keep 'error' state
      if (registrationStatus !== 'error') {
         // Keep pending state while processing, reset only if not error
         // The success case handles redirection, so we might not need idle reset here.
         // If registration is successful, it redirects. If it fails, it stays in 'error'.
         // Let's remove the automatic reset to idle here.
         // setRegistrationStatus('idle');
      }
       // Reset to idle only if successful to allow user to retry on error
       if (registrationStatus === 'success') {
         setRegistrationStatus('idle');
       } else if (registrationStatus === 'pending') {
         // If still pending after try/catch (shouldn't happen often), reset
         setRegistrationStatus('idle');
       }
       // Keep 'error' state if it landed there, don't reset automatically
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-12 md:p-24">
      <Toaster /> {/* Ensure Toaster is rendered */}
      <Card className="w-full max-w-md p-4">
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
              onChange={(e) => { setEmail(e.target.value); setRegistrationStatus('idle');}} // Reset status on input change
              disabled={registrationStatus === 'pending'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="password">Password</label>
            <Input
              type="password"
              id="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setRegistrationStatus('idle');}} // Reset status on input change
              disabled={registrationStatus === 'pending'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="role">Role</label>
            <Select
              onValueChange={(value) => { setRole(value as 'student' | 'professor' | ''); setRegistrationStatus('idle');}} // Reset status on input change
              value={role} // Ensure value is controlled
              disabled={registrationStatus === 'pending'}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="professor">Professor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleRegister} disabled={!isFormValid || registrationStatus === 'pending' || registrationStatus === 'error'}>
             {registrationStatus === 'pending'
              ? 'Registering...'
              : registrationStatus === 'error'
              ? 'Registration Failed - Retry?'
              : 'Register'}
          </Button>
          {/* Display error message directly in the form as well */}
           {registrationStatus === 'error' && (
             <p className="text-sm text-destructive">Registration failed. Please check your input or try again later.</p>
           )}
        </CardContent>
      </Card>
    </main>
  );
}
