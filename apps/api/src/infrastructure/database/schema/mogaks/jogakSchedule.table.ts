import { bigint, date, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { jogaks } from './jogak.table';

/** Effective-date schedule history for a Jogak. */
export const jogakSchedules = pgTable('jogak_schedules', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  jogakId: bigint('jogak_id', { mode: 'number' })
    .notNull()
    .references(() => jogaks.id),
  scheduleType: varchar('schedule_type', { length: 16 }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
