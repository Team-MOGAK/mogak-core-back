import { bigint, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { mogaks } from './mogak.table';

/** A task inside a Mogak. */
export const jogaks = pgTable('jogak', {
  id: bigint('jogak_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  mogakId: bigint('mogak_id', { mode: 'number' })
    .notNull()
    .references(() => mogaks.id),
  title: varchar('title', { length: 100 }).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
