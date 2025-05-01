'use server';

import fs from 'fs/promises';
import path from 'path';
import { logError } from '@/services/logging'; // Import logging

// Base directory for storing data files inside the container
// This should correspond to the volume mount point in Docker
const CONFIG_DIR = path.resolve(process.cwd(), 'config');

/**
 * Ensures the configuration directory exists.
 */
const ensureConfigDir = async (): Promise<void> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== 'EEXIST') {
      console.error(`[Storage] Error creating config directory ${CONFIG_DIR}:`, error);
      // Log the error but allow the operation to potentially continue
      await logError(error, 'Ensure Config Dir');
      // Optionally re-throw if directory creation is absolutely critical
      // throw new Error('Could not create configuration directory.');
    }
  }
};

/**
 * Reads data from a JSON file within the config directory.
 *
 * @param filename The name of the file (without .json extension).
 * @param defaultValue The default value to return if the file doesn't exist or is empty/invalid.
 * @returns A promise that resolves with the parsed data or the default value.
 */
export const readData = async <T>(filename: string, defaultValue: T): Promise<T> => {
  await ensureConfigDir(); // Ensure directory exists before reading
  const filePath = path.join(CONFIG_DIR, `${filename}.json`);
  console.log(`[Storage] Reading data from: ${filePath}`); // Log read attempt

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    if (!fileContent.trim()) { // Check for empty or whitespace-only content
      console.log(`[Storage] File ${filePath} is empty, returning default value.`);
      return defaultValue; // Return default if file is empty
    }
    // Add detailed error logging for parsing
    try {
      const parsedData = JSON.parse(fileContent) as T;
      // Basic validation: check if parsedData is not null and is an object (for most cases)
      // or an array (for configurations)
      if (parsedData !== null && (typeof parsedData === 'object' || Array.isArray(parsedData))) {
          return parsedData;
      } else {
          console.warn(`[Storage] Invalid data format in ${filePath}. Returning default value.`);
          await logError(`Invalid data format in ${filePath}`, `Read Data (${filename})`);
          return defaultValue;
      }
    } catch (parseError: any) {
        console.error(`[Storage] Error parsing JSON from ${filePath}:`, parseError.message);
        await logError(parseError, `Read Data JSON Parse (${filename})`);
        // Optionally log the problematic content (be careful with sensitive data)
        // console.error("Problematic content:", fileContent.substring(0, 500)); // Log first 500 chars
        return defaultValue;
    }

  } catch (error: any) {
    // If the error is ENOENT (file not found), return the default value silently.
    if (error.code === 'ENOENT') {
      console.log(`[Storage] File ${filePath} not found, returning default value.`);
      return defaultValue;
    }
    // Log other read errors
    console.error(`[Storage] Error reading data from ${filePath}:`, error);
    await logError(error, `Read Data (${filename})`);
    // Depending on the error, you might want to throw or return default
    return defaultValue; // Return default on other read errors for resilience
  }
};

/**
 * Writes data to a JSON file within the config directory.
 *
 * @param filename The name of the file (without .json extension).
 * @param data The data to write (will be JSON.stringify'd).
 * @returns A promise that resolves when the data is written successfully or rejects on error.
 */
export const writeData = async <T>(filename: string, data: T): Promise<void> => {
  await ensureConfigDir(); // Ensure directory exists before writing
  const filePath = path.join(CONFIG_DIR, `${filename}.json`);
  console.log(`[Storage] Writing data to: ${filePath}`); // Log write attempt
  try {
    // Ensure data is not undefined before stringifying
    const dataToWrite = data === undefined ? null : data;
    const fileContent = JSON.stringify(dataToWrite, null, 2); // Pretty print JSON
    await fs.writeFile(filePath, fileContent, 'utf-8');
    console.log(`[Storage] Data successfully written to: ${filePath}`);
  } catch (error) {
    console.error(`[Storage] Error writing data to ${filePath}:`, error);
    await logError(error, `Write Data (${filename})`);
    throw new Error(`Could not write data to file: ${filename}.json`);
  }
};

/**
 * Deletes a JSON file from the config directory.
 *
 * @param filename The name of the file (without .json extension).
 * @returns A promise that resolves when the deletion is complete or rejects on error.
 */
export const deleteData = async (filename: string): Promise<void> => {
    await ensureConfigDir(); // Ensure directory exists
    const filePath = path.join(CONFIG_DIR, `${filename}.json`);
    console.log(`[Storage] Attempting to delete data file: ${filePath}`); // Log delete path

    try {
        await fs.unlink(filePath);
        console.log(`[Storage] Data file successfully deleted: ${filePath}`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`[Storage] Data file not found, skipping deletion: ${filePath}`);
            // Optionally log this event if needed, but it's not usually an error
            // await logError(`Attempted to delete non-existent file: ${filePath}`, `Delete Data (${filename})`);
        } else {
            console.error(`[Storage] Error deleting file ${filePath}:`, error);
            await logError(error, `Delete Data (${filename})`);
            throw new Error(`Failed to delete data for ${filename}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};