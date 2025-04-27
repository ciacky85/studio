'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useRouter} from 'next/navigation';
import {sendEmail} from '@/services/email'; // Import the email service
import {useToast} from "@/hooks/use-toast";
// import ClientHeader from '@/components/ClientHeader'; // Remove import - Handled by RootLayout

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'professor' | ''>('');
  const router = useRouter();
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const {toast} = useToast();

  // Form validation check
  const isFormValid = email && password && role;

  const handleRegister = async () => {
    // Reset status if retrying from error state
    if (registrationStatus === 'error') {
      setRegistrationStatus('idle');
    }

    if (!isFormValid) {
        toast({
            variant: "destructive",
            title: "Missing Information",
            description: "Please fill in all required fields.",
        });
        return; // Stop execution if form is invalid
    }

    setRegistrationStatus('pending');
    try {

      // Check if user already exists in localStorage
      if (typeof window !== 'undefined') {
        if (localStorage.getItem(email)) {
            throw new Error('User with this email already exists.');
        }

        // Simulate user creation: Store user data with 'approved: false'
        localStorage.setItem(email, JSON.stringify({password, role, approved: false}));

        // Send notification email to the admin (replace with actual admin email if needed)
        // Ensure the admin email is correct and reliable
        await sendEmail({
          to: 'carlo.checchi@gmail.com', // Consider making this configurable via environment variables
          subject: 'New User Registration Pending Approval',
          html: `<p>A new user has registered and requires approval:</p><ul><li>Email: ${email}</li><li>Role: ${role}</li></ul><p>Please log in to the admin panel to approve or reject.</p>`,
        });

        setRegistrationStatus('success');
        toast({
          title: "Registration Submitted",
          description: "Your registration requires admin approval. You will be notified once approved.",
        });

        // Clear form fields after successful submission for better UX
        setEmail('');
        setPassword('');
        setRole('');

        // Redirect to login page after a short delay
         setTimeout(() => router.push('/'), 3000); // Increased delay
      } else {
        // Handle case where localStorage is not available (should not happen in browser)
        throw new Error('Local storage is not available.');
      }

    } catch (error: any) {
      console.error('Registration failed:', error);
      setRegistrationStatus('error'); // Keep in 'error' state
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
      });
    }
  };

  return (
    <>
      {/* <ClientHeader /> */} {/* Remove ClientHeader rendering here */}
      <main className="flex flex-grow flex-col items-center justify-center p-4 sm:p-12 md:p-24">
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
                onChange={(e) => { setEmail(e.target.value); if (registrationStatus === 'error') setRegistrationStatus('idle');}} // Reset from error on input change
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'} // Disable on pending/success
                required // Added HTML5 validation
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password">Password</label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (registrationStatus === 'error') setRegistrationStatus('idle');}} // Reset from error on input change
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'} // Disable on pending/success
                required // Added HTML5 validation
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="role">Role</label>
              <Select
                onValueChange={(value) => { setRole(value as 'student' | 'professor'); if (registrationStatus === 'error') setRegistrationStatus('idle');}} // Reset from error on input change
                value={role} // Ensure value is controlled
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'} // Disable on pending/success
                required // Added HTML5 validation
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
             {registrationStatus === 'error' && (
               <p className="text-sm text-destructive">Registration failed. Please check your input or try again later.</p>
             )}
            <Button
              onClick={handleRegister}
              disabled={!isFormValid || registrationStatus === 'pending' || registrationStatus === 'success'} // Also disable on success to prevent double submission
            >
              {registrationStatus === 'pending'
                ? 'Registering...'
                : registrationStatus === 'success'
                ? 'Submitted!'
                : registrationStatus === 'error'
                ? 'Retry Registration' // Changed text for clarity
                : 'Register'}
            </Button>

          </CardContent>
        </Card>
      </main>
    </>
  );
}
