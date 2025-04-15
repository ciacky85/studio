// The AI flow for suggesting optimal lesson slot times for professors, incorporating student demand and classroom availability.
//
// - suggestOptimalSlots - The function to call to get optimal slot suggestions.
// - SuggestOptimalSlotsInput - The input type for the suggestOptimalSlots function.
// - SuggestOptimalSlotsOutput - The return type for the suggestOptimalSlots function.

'use server';

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {EmailDetails, sendEmail} from '@/services/email';

const SuggestOptimalSlotsInputSchema = z.object({
  professorName: z.string().describe('The name of the professor requesting slot suggestions.'),
  classroomAvailability: z.string().describe('The available classrooms and times provided by the admin, e.g., \"Monday 8 AM - 10 AM in Room 1, Tuesday 5 PM - 8 PM in Room 2\".'),
  studentDemand: z.string().describe('Information about student demand, such as preferred days, times, and lesson durations.'),
  currentSchedule: z.string().optional().describe('The professor\'s current schedule, if any.'),
});
export type SuggestOptimalSlotsInput = z.infer<typeof SuggestOptimalSlotsInputSchema>;

const SuggestedSlotSchema = z.object({
  day: z.string().describe('The day of the week for the suggested slot.'),
  time: z.string().describe('The time of day for the suggested slot (e.g., 8:00 AM).'),
  duration: z.number().describe('The duration of the suggested slot in minutes (30 or 60).'),
  classroom: z.string().describe('The classroom for the suggested slot.'),
  reason: z.string().describe('The reason why this slot is suggested.'),
});

const SuggestOptimalSlotsOutputSchema = z.object({
  suggestedSlots: z.array(SuggestedSlotSchema).describe('An array of suggested lesson slots.'),
  summary: z.string().describe('A summary of the suggested slots and the reasoning behind them.'),
});
export type SuggestOptimalSlotsOutput = z.infer<typeof SuggestOptimalSlotsOutputSchema>;

export async function suggestOptimalSlots(input: SuggestOptimalSlotsInput): Promise<SuggestOptimalSlotsOutput> {
  return suggestOptimalSlotsFlow(input);
}

const suggestOptimalSlotsPrompt = ai.definePrompt({
  name: 'suggestOptimalSlotsPrompt',
  input: {
    schema: z.object({
      professorName: z.string().describe('The name of the professor.'),
      classroomAvailability: z.string().describe('The available classrooms and times.'),
      studentDemand: z.string().describe('Information about student demand.'),
      currentSchedule: z.string().optional().describe('The professor\'s current schedule, if any.'),
    }),
  },
  output: {
    schema: z.object({
      suggestedSlots: z.array(SuggestedSlotSchema).describe('An array of suggested lesson slots, each including day, time, duration (30 or 60 minutes), classroom, and a brief reason.'),
      summary: z.string().describe('A summary of the suggested slots and the reasoning behind them.'),
    }),
  },
  prompt: `You are an AI assistant helping a professor schedule their lessons.

  Professor Name: {{{professorName}}}
  Classroom Availability: {{{classroomAvailability}}}
  Student Demand: {{{studentDemand}}}
  Current Schedule (if any): {{{currentSchedule}}}

  Based on the classroom availability and student demand, suggest optimal lesson slots for the professor.
  Each slot should include the day, time, duration (30 or 60 minutes), classroom, and a brief reason for the suggestion.
  Also, provide a summary of the suggested slots and the overall reasoning.

  Ensure that the suggested slots are within the provided classroom availability and cater to the student demand.
  Return the suggestions in a JSON format.
  `, // Make sure the output fits the SuggestOptimalSlotsOutputSchema
});

const suggestOptimalSlotsFlow = ai.defineFlow<
  typeof SuggestOptimalSlotsInputSchema,
  typeof SuggestOptimalSlotsOutputSchema
>({
  name: 'suggestOptimalSlotsFlow',
  inputSchema: SuggestOptimalSlotsInputSchema,
  outputSchema: SuggestOptimalSlotsOutputSchema,
}, async input => {
  const {output} = await suggestOptimalSlotsPrompt(input);
  return output!;
});
