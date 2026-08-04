import { bigint, boolean, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/** Public consent catalogue. */
export const consentItems = pgTable(
  'consent_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    required: boolean('required').notNull(),
    active: boolean('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('consent_items_code_unique').on(table.code)],
);
