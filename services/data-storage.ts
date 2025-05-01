
'use server';

import fs from 'fs';
import path from 'path';

// Define the path for the data storage directory relative to the project root
// Using /app/data which will be mapped to a host volume
const dataDir = path.resolve(process.cwd(), 'data');

// Ensure the data directory exists
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Data directory created: ${dataDir}`);
    // Attempt to set permissions if needed, although volume mapping often handles this
    // fs.chmodSync(dataDir, 0o777); // Example: might not be necessary depending on Docker setup
  } catch (err) {
    console.error(`Error creating data directory ${dataDir}:`, err);
    // Depending on the severity, you might want to throw the error
    // throw new Error(`Could not create data directory: ${err.message}`);
  }
} else {
   console.log(`Data directory already exists: ${dataDir}`);
}


/**
 * Reads data from a JSON file within the data directory.
 *
 * @param filename The name of the file (without .json extension).
 * @param defaultValue The default value to return if the file doesn't exist or is empty/invalid.
 * @returns The parsed JSON data or the default value.
 */
export async function readData<T>(filename: string, defaultValue: T): Promise<T> {
  const filePath = path.join(dataDir, `${filename}.json`);
  console.log(`Attempting to read data from: ${filePath}`); // Log read path

  try {
    // Check if file exists before attempting to read
    if (!fs.existsSync(filePath)) {
        console.log(`File not found, returning default value for: ${filename}`);
        return defaultValue;
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    // Handle empty file case
    if (!fileContent.trim()) {
        console.log(`File is empty, returning default value for: ${filename}`);
        return defaultValue;
    }
    return JSON.parse(fileContent) as T;
  } catch (error: any) {
    // Log specific errors
    if (error.code === 'ENOENT') {
      console.log(`File not found, returning default value for: ${filename}`);
    } else if (error instanceof SyntaxError) {
      console.error(`Error parsing JSON from ${filePath}:`, error);
    } else {
      console.error(`Error reading file ${filePath}:`, error);
    }
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file within the data directory.
 *
 * @param filename The name of the file (without .json extension).
 * @param data The data to write (will be JSON.stringify'd).
 * @returns A promise that resolves when the write is complete or rejects on error.
 */
export async function writeData<T>(filename: string, data: T): Promise<void> {
  const filePath = path.join(dataDir, `${filename}.json`);
   console.log(`Attempting to write data to: ${filePath}`); // Log write path
  try {
    // Ensure directory exists before writing
    await fs.promises.mkdir(dataDir, { recursive: true });
    const jsonData = JSON.stringify(data, null, 2); // Pretty print JSON
    await fs.promises.writeFile(filePath, jsonData, 'utf-8');
    console.log(`Data successfully written to: ${filePath}`);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    // Re-throw or handle as appropriate for the application
    throw new Error(`Failed to write data for ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Deletes a JSON file from the data directory.
 *
 * @param filename The name of the file (without .json extension).
 * @returns A promise that resolves when the deletion is complete or rejects on error.
 */
export async function deleteData(filename: string): Promise<void> {
    const filePath = path.join(dataDir, `${filename}.json`);
    console.log(`Attempting to delete data file: ${filePath}`); // Log delete path

    try {
        // Check if file exists before attempting deletion
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`Data file successfully deleted: ${filePath}`);
        } else {
            console.log(`Data file not found, skipping deletion: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error deleting file ${filePath}:`, error);
        throw new Error(`Failed to delete data for ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
