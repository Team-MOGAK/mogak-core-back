import { bigint, pgTable, varchar } from 'drizzle-orm/pg-core';

/** Lookup table for a user's job. */
export const jobs = pgTable('jobs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});
