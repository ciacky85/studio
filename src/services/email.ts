
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

// Configure Nodemailer transporter using environment variables
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use Gmail service
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address from .env
    pass: process.env.EMAIL_PASS, // Your Gmail App Password from .env
  },
});

/**
 * Asynchronously sends an email using Nodemailer.
 *
 * @param emailDetails The details of the email to send.
 * @returns A promise that resolves when the email is sent successfully or rejects on error.
 */
export async function sendEmail(emailDetails: EmailDetails): Promise<void> {
  const mailOptions = {
    // Update the from field to include the display name
    from: `"Singin' is the present" <${process.env.EMAIL_USER}>`, // Sender address with display name
    to: emailDetails.to, // List of receivers
    subject: emailDetails.subject, // Subject line
    html: emailDetails.html, // HTML body
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email inviata con successo:', info.messageId);
    // console.log("Anteprima URL: %s", nodemailer.getTestMessageUrl(info)); // Uncomment for ethereal.email testing
  } catch (error) {
    console.error('Errore durante l\'invio dell\'email:', error);
    // Re-throw the error or handle it as needed for application flow
    // For example, you might want to show a specific error message to the user
    // depending on the context where sendEmail is called.
    // For now, we just log it server-side and let the calling function handle UI feedback.
    throw new Error(`Impossibile inviare l'email a ${emailDetails.to}. Errore: ${error instanceof Error ? error.message : String(error)}`);
  }
}

