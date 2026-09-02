import { bigint, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { addresses } from './address.table';
import { jobs } from './job.table';

/** Account root table. */
export const users = pgTable(
  'users',
  {
    id: bigint('user_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jobId: integer('job_id').references(() => jobs.id),
    addressId: integer('address_id').references(() => addresses.id),
    nickname: varchar('nickname', { length: 255 }),
    email: varchar('email', { length: 255 }),
    gender: varchar('gender', { length: 1 }),
    age: integer('age'),
    role: varchar('role', { length: 32 }).notNull().default('PENDING'),
    profileImageKey: varchar('profile_img_url', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('users_nickname_unique').on(table.nickname)],
);
