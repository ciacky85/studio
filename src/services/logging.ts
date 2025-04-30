
'use server';

import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// Base directory for storing log files inside the container
const CONFIG_DIR = path.resolve(process.cwd(), 'config');
const LOG_FILE = path.join(CONFIG_DIR, 'errors.log');

/**
 * Ensures the configuration directory exists.
 */
const ensureConfigDir = async (): Promise<void> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== 'EEXIST') {
      console.error(`[Logging] Error creating config directory ${CONFIG_DIR}:`, error);
      // Throwing here might prevent logging, maybe just log to console?
      // For now, let it proceed, maybe the log file write will fail later.
    }
  }
};

/**
 * Logs an error message to the errors.log file.
 *
 * @param error The error object or message to log.
 * @param context An optional context string (e.g., function name) where the error occurred.
 */
export const logError = async (error: any, context?: string): Promise<void> => {
  await ensureConfigDir(); // Ensure directory exists before logging

  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ssXXX', { locale: it });
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.stack ? error.stack : error.message;
  } else if (typeof error === 'object' && error !== null) {
    errorMessage = JSON.stringify(error);
  } else {
    errorMessage = String(error);
  }

  const contextPrefix = context ? `[${context}] ` : '';
  const logEntry = `${timestamp} ${contextPrefix}${errorMessage}\n---\n`;

  try {
    await fs.appendFile(LOG_FILE, logEntry, 'utf-8');
  } catch (writeError) {
    console.error(`[Logging] FATAL: Could not write to log file ${LOG_FILE}:`, writeError);
    // Fallback: Log the original error and the write error to console
    console.error(`[Logging] Original error (${context || 'unknown context'}):`, error);
  }
};
