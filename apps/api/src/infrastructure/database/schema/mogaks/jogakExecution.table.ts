import { bigint, date, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jogaks } from './jogak.table';

/** Recorded state for one scheduled Jogak occurrence. */
export const jogakExecutions = pgTable(
  'daily_jogak',
  {
    id: bigint('daily_jogak_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jogakId: bigint('jogak_id', { mode: 'number' })
      .notNull()
      .references(() => jogaks.id),
    scheduledDate: date('target_date').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    jogakTitleSnapshot: varchar('title', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_daily_jogak_jogak_target').on(table.jogakId, table.scheduledDate)],
);
