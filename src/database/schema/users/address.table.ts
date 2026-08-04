import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';

/** Lookup table for a user's address. */
export const addresses = pgTable('address', {
  id: integer('address_id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});
