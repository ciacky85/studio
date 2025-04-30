
'use server';

import nodemailer from 'nodemailer';

/**
 * Represents the details required to send an email.
 */
export interface EmailDetails {
  /**
   * The recipient's email address.
   */
  to: string;
  /**
   * The subject of the email.
   */
  subject: string;
  /**
   * The HTML content of the email.
   */
  html: string;
}

let transporter: nodemailer.Transporter | null = null;

try {
  // Check if environment variables are set
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('ATTENZIONE: Variabili d\'ambiente EMAIL_USER o EMAIL_PASS non impostate. L\'invio email non funzionerà.');
  } else {
    // Configure Nodemailer transporter using environment variables
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use the App Password generated from Google Account settings
      },
      // Increase timeout for connection and greeting
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000, // 10 seconds
      socketTimeout: 10000, // 10 seconds
      // Enable debugging output for Nodemailer
      // logger: true,
      // debug: true, // Enable debug output
    });

    // Verify connection configuration (optional but helpful for debugging)
    transporter.verify(function(error, success) {
      if (error) {
        console.error('Errore configurazione transporter Nodemailer:', error);
        transporter = null; // Set transporter to null if verification fails
      } else {
        console.log('Server Nodemailer pronto per ricevere messaggi');
      }
    });
  }
} catch (initError) {
  console.error('Errore durante l\'inizializzazione del transporter Nodemailer:', initError);
  transporter = null; // Ensure transporter is null if init fails
}


/**
 * Asynchronously sends an email using Nodemailer.
 *
 * @param emailDetails The details of the email to send.
 * @returns A promise that resolves when the email is sent successfully or rejects on error.
 */
export async function sendEmail(emailDetails: EmailDetails): Promise<void> {
  // Check if transporter is initialized and environment variables are set
  if (!transporter || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
     console.error('Invio email saltato: Transporter non inizializzato o credenziali mancanti.');
     // Decide how to handle this: throw an error or return silently?
     // Throwing makes the calling function aware of the failure.
     throw new Error('Configurazione email non valida o mancante.');
     // return; // Or return silently if email failure is acceptable in some contexts
  }

  const mailOptions = {
    from: `"Creative Academy Booking" <${process.env.EMAIL_USER}>`, // Sender address with display name
    to: emailDetails.to,
    subject: emailDetails.subject,
    html: emailDetails.html,
  };

  console.log(`Tentativo di invio email a ${emailDetails.to} con oggetto: ${emailDetails.subject}`); // Log attempt

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email inviata con successo a ${emailDetails.to}. Message ID: ${info.messageId}`); // Log success
  } catch (error) {
    console.error(`Errore durante l'invio dell'email a ${emailDetails.to}:`, error instanceof Error ? error.stack : error); // Log detailed error and stack trace
    // Consider how to handle email sending errors - maybe retry or log differently
    throw new Error(`Impossibile inviare l'email a ${emailDetails.to}. Errore: ${error instanceof Error ? error.message : String(error)}`);
  }
}
