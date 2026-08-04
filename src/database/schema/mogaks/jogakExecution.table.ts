import { bigint, date, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jogaks } from './jogak.table';

/** Recorded state for one scheduled Jogak occurrence. */
export const jogakExecutions = pgTable(
  'jogak_executions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jogakId: bigint('jogak_id', { mode: 'number' })
      .notNull()
      .references(() => jogaks.id, { onDelete: 'cascade' }),
    scheduledDate: date('scheduled_date').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    jogakTitleSnapshot: varchar('jogak_title_snapshot', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('jogak_executions_jogak_scheduled_date_unique').on(table.jogakId, table.scheduledDate),
  ],
);
