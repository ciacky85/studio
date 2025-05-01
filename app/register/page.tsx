
'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useRouter} from 'next/navigation';
import {sendEmail} from '@/services/email'; // Import the email service
import { readData, writeData } from '@/services/data-storage'; // Import data storage service
import {useToast} from "@/hooks/use-toast";
import Link from 'next/link';
import type { UserData, AllUsersData } from '@/types/user'; // Use correct types
import { logError } from '@/services/logging'; // Import the error logging service


// Constants for filenames and keys
const USERS_DATA_FILE = 'users'; // Stores all users

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
    // Reset error state if retrying
    if (registrationStatus === 'error') {
      setRegistrationStatus('idle');
    }

    if (!isFormValid) {
        toast({
            variant: "destructive",
            title: "Informazioni Mancanti",
            description: "Per favore, compila tutti i campi richiesti.",
        });
        return;
    }

    setRegistrationStatus('pending');
    console.log(`[Register] Attempting registration for: ${email}, Role: ${role}`);

    try {
      // Read existing users data
      console.log(`[Register] Reading data from ${USERS_DATA_FILE}...`);
      const allUsers = await readData<AllUsersData>(USERS_DATA_FILE, {});
      console.log(`[Register] Existing user data read successfully.`);

      // Check if user already exists
      if (allUsers[email]) {
          console.warn(`[Register] User already exists: ${email}`);
          // Explicitly set status to error before throwing
          setRegistrationStatus('error');
          throw new Error('Utente con questa email già esistente.');
      }
      console.log(`[Register] User ${email} does not exist, proceeding.`);

      // Prepare new user data
      // IMPORTANT: Hash passwords in a real application!
      const newUser: UserData = {
          password: password, // Store plain text password (INSECURE for real apps)
          role: role as 'student' | 'professor', // Cast role after validation
          approved: false, // Default to not approved
          assignedProfessorEmail: null, // Initialize assigned professors as null
      };
      console.log(`[Register] New user data prepared for ${email}.`);


      // Add the new user to the data structure using email as the key
      allUsers[email] = newUser;

      // Write the updated data back to the file
      console.log(`[Register] Writing updated user data to ${USERS_DATA_FILE}...`);
      await writeData<AllUsersData>(USERS_DATA_FILE, allUsers);
      console.log(`[Register] User data written successfully.`);


      // Send notification email to the admin
      try {
        console.log(`[Register] Sending notification email to admin...`);
        await sendEmail({
          to: 'carlo.checchi@gmail.com', // Consider env variable for admin email
          subject: 'Nuova Registrazione Utente in Attesa di Approvazione',
          html: `<p>Un nuovo utente si è registrato e richiede approvazione:</p><ul><li>Email: ${email}</li><li>Ruolo: ${role}</li></ul><p>Accedi al pannello di amministrazione per approvare o rifiutare.</p>`,
        });
        console.log(`[Register] Admin notification email sent successfully.`);
        // Set success status ONLY after email attempt (even if email fails but is caught)
        setRegistrationStatus('success');
        toast({
          title: "Registrazione Inviata",
          description: "La tua registrazione richiede l'approvazione dell'amministratore. Sarai avvisato una volta approvato.",
        });
      } catch (emailError: any) {
        console.error(`[Register] Failed to send admin notification email, but registration data was saved:`, emailError);
        await logError(emailError, 'Register (Admin Notification)');
        // Set success status even if email fails, but show warning toast
        setRegistrationStatus('success');
        // Notify user about successful registration but potential email issue
        toast({
            title: "Registrazione Inviata (con avviso)",
            description: "La tua registrazione è stata salvata ma c'è stato un problema nell'invio della notifica all'amministratore.",
            variant: "default", // Use default variant for warning
        });
      }


      // Clear form fields only on complete success (including email attempt)
      setEmail('');
      setPassword('');
      setRole('');

      // Redirect to login after delay - Consider removing or shortening delay
      // setTimeout(() => router.push('/'), 3000);

    } catch (error: any) {
      // Log the detailed error to the server console AND the log file
      console.error('[Register] REGISTRAZIONE FALLITA:', error);
      await logError(error, 'Register (Main Catch)'); // Log the error to file
      // Ensure status is set to error here
      setRegistrationStatus('error');
      toast({
        variant: "destructive",
        title: "Registrazione Fallita",
        // Provide a more generic message in the UI but log the detail
        description: `Si è verificato un errore durante la registrazione: ${error?.message ?? 'Errore sconosciuto'}. Controlla errors.log per i dettagli.`,
        // description: error.message || "Si è verificato un errore inaspettato. Per favore riprova.", // Original message
      });
       // Clear only password on error, keep email and role
       setPassword('');
    }
  };

  return (
    <>
      <main className="flex flex-grow flex-col items-center justify-center p-4 sm:p-12 md:p-24">
        <Card className="w-full max-w-md p-4">
          <CardHeader>
            <CardTitle>Registrati</CardTitle>
            <CardDescription>Crea un account per accedere all'applicazione.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email">Email</label>
              <Input
                type="email"
                id="email"
                placeholder="esempio@esempio.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (registrationStatus === 'error') setRegistrationStatus('idle');}}
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password">Password</label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (registrationStatus === 'error') setRegistrationStatus('idle');}}
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="role">Ruolo</label>
              <Select
                onValueChange={(value) => { setRole(value as 'student' | 'professor'); if (registrationStatus === 'error') setRegistrationStatus('idle');}}
                value={role}
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona Ruolo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Studente</SelectItem>
                  <SelectItem value="professor">Professore</SelectItem>
                </SelectContent>
              </Select>
            </div>
             {registrationStatus === 'error' && (
               <p className="text-sm text-destructive">Registrazione fallita. Controlla i dati inseriti o riprova più tardi.</p>
             )}
            <Button
              onClick={handleRegister}
              disabled={!isFormValid || registrationStatus === 'pending' || registrationStatus === 'success'}
            >
              {registrationStatus === 'pending'
                ? 'Registrazione...'
                : registrationStatus === 'success'
                ? 'Registrazione Inviata!' // Changed text for clarity
                : registrationStatus === 'error'
                ? 'Riprova Registrazione'
                : 'Registrati'}
            </Button>
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full">Torna al Login</Button>
            </Link>

          </CardContent>
        </Card>
      </main>
    </>
  );
}

