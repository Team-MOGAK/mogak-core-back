import { bigint, boolean, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/** Public consent catalogue. */
export const consentItems = pgTable(
  'consent_item',
  {
    id: bigint('consent_item_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    required: boolean('required').notNull(),
    active: boolean('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_consent_item_code').on(table.code)],
);
