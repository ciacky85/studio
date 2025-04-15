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

/**
 * Asynchronously sends an email.
 *
 * @param emailDetails The details of the email to send.
 * @returns A promise that resolves when the email is sent successfully.
 */
export async function sendEmail(emailDetails: EmailDetails): Promise<void> {
  // TODO: Implement this by calling an email sending API.
  console.log("Sending email to", emailDetails.to, "with subject", emailDetails.subject);
}
