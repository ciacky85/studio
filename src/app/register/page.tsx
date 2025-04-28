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
            title: "Informazioni Mancanti",
            description: "Per favore, compila tutti i campi richiesti.",
        });
        return; // Stop execution if form is invalid
    }

    setRegistrationStatus('pending');
    try {

      // Check if user already exists in localStorage
      if (typeof window !== 'undefined') {
        if (localStorage.getItem(email)) {
            throw new Error('Utente con questa email già esistente.');
        }

        // Simulate user creation: Store user data with 'approved: false'
        localStorage.setItem(email, JSON.stringify({password, role, approved: false}));

        // Send notification email to the admin (replace with actual admin email if needed)
        // Ensure the admin email is correct and reliable
        await sendEmail({
          to: 'carlo.checchi@gmail.com', // Consider making this configurable via environment variables
          subject: 'Nuova Registrazione Utente in Attesa di Approvazione',
          html: `<p>Un nuovo utente si è registrato e richiede approvazione:</p><ul><li>Email: ${email}</li><li>Ruolo: ${role}</li></ul><p>Accedi al pannello di amministrazione per approvare o rifiutare.</p>`,
        });

        setRegistrationStatus('success');
        toast({
          title: "Registrazione Inviata",
          description: "La tua registrazione richiede l'approvazione dell'amministratore. Sarai avvisato una volta approvato.",
        });

        // Clear form fields after successful submission for better UX
        setEmail('');
        setPassword('');
        setRole('');

        // Redirect to login page after a short delay
         setTimeout(() => router.push('/'), 3000); // Increased delay
      } else {
        // Handle case where localStorage is not available (should not happen in browser)
        throw new Error('Local storage non disponibile.');
      }

    } catch (error: any) {
      console.error('Registrazione fallita:', error);
      setRegistrationStatus('error'); // Keep in 'error' state
      toast({
        variant: "destructive",
        title: "Registrazione Fallita",
        description: error.message || "Si è verificato un errore inaspettato. Per favore riprova.",
      });
    }
  };

  return (
    <>
      {/* <ClientHeader /> */} {/* Remove ClientHeader rendering here */}
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
              <label htmlFor="role">Ruolo</label>
              <Select
                onValueChange={(value) => { setRole(value as 'student' | 'professor'); if (registrationStatus === 'error') setRegistrationStatus('idle');}} // Reset from error on input change
                value={role} // Ensure value is controlled
                disabled={registrationStatus === 'pending' || registrationStatus === 'success'} // Disable on pending/success
                required // Added HTML5 validation
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
              disabled={!isFormValid || registrationStatus === 'pending' || registrationStatus === 'success'} // Also disable on success to prevent double submission
            >
              {registrationStatus === 'pending'
                ? 'Registrazione...'
                : registrationStatus === 'success'
                ? 'Inviato!'
                : registrationStatus === 'error'
                ? 'Riprova Registrazione' // Changed text for clarity
                : 'Registrati'}
            </Button>

          </CardContent>
        </Card>
      </main>
    </>
  );
}
