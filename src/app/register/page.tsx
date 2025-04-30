
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
      console.log(`[Register] Sending notification email to admin...`);
      await sendEmail({
        to: 'carlo.checchi@gmail.com', // Consider env variable for admin email
        subject: 'Nuova Registrazione Utente in Attesa di Approvazione',
        html: `<p>Un nuovo utente si è registrato e richiede approvazione:</p><ul><li>Email: ${email}</li><li>Ruolo: ${role}</li></ul><p>Accedi al pannello di amministrazione per approvare o rifiutare.</p>`,
      });
      console.log(`[Register] Admin notification email sent successfully.`);

      setRegistrationStatus('success');
      toast({
        title: "Registrazione Inviata",
        description: "La tua registrazione richiede l'approvazione dell'amministratore. Sarai avvisato una volta approvato.",
      });

      // Clear form fields
      setEmail('');
      setPassword('');
      setRole('');

      // Redirect to login after delay
      // setTimeout(() => router.push('/'), 3000); // Temporarily disable redirect for easier debugging if needed

    } catch (error: any) {
      // Log the detailed error to the server console (visible in Docker logs)
      // Log the full error object, including stack trace if available
      console.error('[Register] REGISTRAZIONE FALLITA:', error instanceof Error ? error.stack : error);
      setRegistrationStatus('error');
      toast({
        variant: "destructive",
        title: "Registrazione Fallita",
        // Provide a more generic message in the UI but log the detail
        description: "Si è verificato un errore durante la registrazione. Controlla la console del server per i dettagli.",
        // description: error.message || "Si è verificato un errore inaspettato. Per favore riprova.", // Original message
      });
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
                ? 'Inviato!'
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

