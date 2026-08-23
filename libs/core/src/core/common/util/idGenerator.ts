import { v7 as uuidv7 } from 'uuid';

/**
 * Global Identifier Generator
 * Centralizes UUID/ID generation logic across the application.
 */
export const generateId = (): string => uuidv7();
