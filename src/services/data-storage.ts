
'use server';

import fs from 'fs/promises';
import path from 'path';

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
      console.error(`Error creating config directory ${CONFIG_DIR}:`, error);
      throw new Error('Could not create configuration directory.');
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
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    if (!fileContent) {
      return defaultValue; // Return default if file is empty
    }
    // Add detailed error logging for parsing
    try {
      const parsedData = JSON.parse(fileContent) as T;
      // Basic validation: check if parsedData is not null and is an object (for most cases)
      if (parsedData !== null && typeof parsedData === 'object') {
          return parsedData;
      } else {
          console.warn(`Invalid data format in ${filePath}. Returning default value.`);
          return defaultValue;
      }
    } catch (parseError: any) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError.message);
        // Optionally log the problematic content (be careful with sensitive data)
        // console.error("Problematic content:", fileContent.substring(0, 500)); // Log first 500 chars
        return defaultValue;
    }

  } catch (error: any) {
    // If the error is ENOENT (file not found), return the default value silently.
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    // Log other read errors
    console.error(`Error reading data from ${filePath}:`, error);
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
  try {
    // Ensure data is not undefined before stringifying
    const dataToWrite = data === undefined ? null : data;
    const fileContent = JSON.stringify(dataToWrite, null, 2); // Pretty print JSON
    await fs.writeFile(filePath, fileContent, 'utf-8');
  } catch (error) {
    console.error(`Error writing data to ${filePath}:`, error);
    throw new Error(`Could not write data to file: ${filename}.json`);
  }
};
