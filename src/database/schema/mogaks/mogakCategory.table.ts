import { bigint, boolean, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/** Official categories available to a Mogak. */
export const mogakCategories = pgTable(
  'mogak_categories',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('mogak_categories_code_unique').on(table.code)],
);
