
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
// Ensure EMAIL_USER and EMAIL_PASS are set in your .env file
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use the App Password generated from Google Account settings
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
    from: `"Creative Academy Booking" <${process.env.EMAIL_USER}>`, // Sender address with display name
    to: emailDetails.to,
    subject: emailDetails.subject,
    html: emailDetails.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email inviata con successo:', info.messageId);
  } catch (error) {
    console.error('Errore durante l\'invio dell\'email:', error);
    // Consider how to handle email sending errors - maybe retry or log differently
    throw new Error(`Impossibile inviare l'email a ${emailDetails.to}. Errore: ${error instanceof Error ? error.message : String(error)}`);
  }
}
