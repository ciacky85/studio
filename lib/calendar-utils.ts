
import { format, addMinutes, parseISO } from 'date-fns';

/**
 * Formats a Date object into the Google Calendar required format (YYYYMMDDTHHmmssZ).
 * @param date The date object.
 * @returns Formatted date string.
 */
const formatGoogleCalendarDate = (date: Date): string => {
  // Use UTC time to ensure consistency across timezones for Google Calendar links
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
};

/**
 * Generates a Google Calendar "Add Event" link.
 *
 * @param startTime The start date and time of the event (as a Date object).
 * @param endTime The end date and time of the event (as a Date object).
 * @param title The title of the event.
 * @param description Optional description for the event.
 * @param location Optional location for the event.
 * @returns A URL string for adding the event to Google Calendar.
 */
export const generateGoogleCalendarAddLink = (
  startTime: Date,
  endTime: Date,
  title: string,
  description?: string,
  location?: string
): string => {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const params = new URLSearchParams();

  params.append('text', title);
  params.append('dates', `${formatGoogleCalendarDate(startTime)}/${formatGoogleCalendarDate(endTime)}`);
  if (description) {
    params.append('details', description);
  }
  if (location) {
    params.append('location', location);
  }

  // Use toString() to get the encoded query string
  return `${baseUrl}&${params.toString()}`;
};


/**
 * Generates a Google Calendar "Search Event" link for a specific day,
 * aiding manual deletion.
 *
 * @param date The date of the event to search for (as a Date object).
 * @param title The title of the event to search for.
 * @returns A URL string for searching the event in Google Calendar.
 */
export const generateGoogleCalendarDeleteLink = (
    date: Date,
    title: string,
): string => {
    const baseUrl = 'https://calendar.google.com/calendar/render?action=SEARCH';
    const params = new URLSearchParams();

    // Format date as YYYYMMDD for the search query
    // Ensure we search using the correct day based on the input Date object
    const searchDate = format(date, "yyyyMMdd");

    params.append('text', title);
    // Search for the event on the specific day
    params.append('dates', `${searchDate}/${searchDate}`);

    return `${baseUrl}&${params.toString()}`;
};


/**
 * Parses slot data and generates Google Calendar links.
 *
 * @param slotDate The date string ('YYYY-MM-DD').
 * @param slotTime The time string ('HH:MM').
 * @param duration The duration in minutes (expected 60).
 * @param addTitle Title for the "Add" link.
 * @param deleteTitle Title for the "Delete/Search" link.
 * @param location Location (classroom) for the event.
 * @param description Optional description.
 * @returns An object containing the add link and delete link.
 */
export const getCalendarLinksFromSlot = (
    slotDate: string,
    slotTime: string,
    duration: number,
    addTitle: string,
    deleteTitle: string,
    location: string, // Added location parameter
    description?: string
) => {
     try {
        // Combine date and time, ensuring correct parsing
        // Using parseISO assumes the date/time is in local timezone based on where the code runs.
        // If server/client timezones differ, consider using UTC or a library like date-fns-tz.
        const startTime = parseISO(`${slotDate}T${slotTime}:00`);
        if (isNaN(startTime.getTime())) {
          throw new Error(`Data o ora non valida: ${slotDate}T${slotTime}:00`);
        }
        const endTime = addMinutes(startTime, duration);

        const addLink = generateGoogleCalendarAddLink(startTime, endTime, addTitle, description, location);
        // Use the startTime (which includes the correct date) for the delete search link
        const deleteLink = generateGoogleCalendarDeleteLink(startTime, deleteTitle);

        return { addLink, deleteLink };
    } catch (error) {
        console.error("Errore durante la generazione dei link del calendario:", error);
        // Return dummy links or handle error appropriately
        return { addLink: '#', deleteLink: '#' };
    }
};
