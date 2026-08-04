import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';

/** Lookup table for a user's job. */
export const jobs = pgTable('job', {
  id: integer('job_id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});
