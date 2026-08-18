import { bigint, pgTable, unique, varchar } from 'drizzle-orm/pg-core';

import { jogakSchedules } from './jogakSchedule.table';

/** One weekday within a weekly Jogak schedule. */
export const jogakScheduleWeekdays = pgTable(
  'jogak_schedule_weekdays',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    scheduleId: bigint('schedule_id', { mode: 'number' })
      .notNull()
      .references(() => jogakSchedules.id),
    weekday: varchar('weekday', { length: 16 }).notNull(),
  },
  (table) => [
    unique('jogak_schedule_weekdays_schedule_weekday_unique').on(table.scheduleId, table.weekday),
  ],
);
