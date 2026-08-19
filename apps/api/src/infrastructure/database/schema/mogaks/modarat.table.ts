import { bigint, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';

/** A user's top-level study group. */
export const modarats = pgTable('modarat', {
  id: bigint('modarat_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  color: varchar('color', { length: 100 }).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
