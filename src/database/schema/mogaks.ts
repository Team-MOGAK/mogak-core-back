import { bigint, boolean, date, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const modarats = pgTable('modarats', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  color: varchar('color', { length: 100 }).notNull(),
  createdAt,
  updatedAt,
});

export const mogakCategories = pgTable(
  'mogak_categories',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [unique('mogak_categories_code_unique').on(table.code)],
);

export const mogaks = pgTable('mogaks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  modaratId: bigint('modarat_id', { mode: 'number' })
    .notNull()
    .references(() => modarats.id, { onDelete: 'cascade' }),
  categoryId: bigint('category_id', { mode: 'number' }).references(() => mogakCategories.id),
  customCategoryName: varchar('custom_category_name', { length: 200 }),
  title: varchar('title', { length: 100 }).notNull(),
  color: varchar('color', { length: 100 }),
  createdAt,
  updatedAt,
});

export const jogaks = pgTable('jogaks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  mogakId: bigint('mogak_id', { mode: 'number' })
    .notNull()
    .references(() => mogaks.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  createdAt,
  updatedAt,
});

export const jogakSchedules = pgTable('jogak_schedules', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  jogakId: bigint('jogak_id', { mode: 'number' })
    .notNull()
    .references(() => jogaks.id, { onDelete: 'cascade' }),
  scheduleType: varchar('schedule_type', { length: 16 }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt,
});

export const jogakScheduleWeekdays = pgTable(
  'jogak_schedule_weekdays',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    scheduleId: bigint('schedule_id', { mode: 'number' })
      .notNull()
      .references(() => jogakSchedules.id, { onDelete: 'cascade' }),
    weekday: varchar('weekday', { length: 16 }).notNull(),
  },
  (table) => [
    unique('jogak_schedule_weekdays_schedule_weekday_unique').on(table.scheduleId, table.weekday),
  ],
);

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
    createdAt,
    updatedAt,
  },
  (table) => [
    unique('jogak_executions_jogak_scheduled_date_unique').on(table.jogakId, table.scheduledDate),
  ],
);
