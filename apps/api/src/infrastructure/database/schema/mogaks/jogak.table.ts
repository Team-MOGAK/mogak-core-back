import { bigint, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { mogaks } from './mogak.table';

/** A task inside a Mogak. */
export const jogaks = pgTable(
  'jogak',
  {
    id: bigint('jogak_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    mogakId: bigint('mogak_id', { mode: 'number' })
      .notNull()
      .references(() => mogaks.id),
    title: varchar('title', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_jogak_mogak_id').on(table.mogakId)],
);
