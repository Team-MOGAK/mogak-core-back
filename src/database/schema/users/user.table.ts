import { bigint, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { addresses } from './address.table';
import { jobs } from './job.table';

/** Account root table. */
export const users = pgTable(
  'users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jobId: bigint('job_id', { mode: 'number' }).references(() => jobs.id),
    addressId: bigint('address_id', { mode: 'number' }).references(() => addresses.id),
    nickname: varchar('nickname', { length: 255 }),
    email: varchar('email', { length: 255 }),
    gender: varchar('gender', { length: 1 }),
    age: integer('age'),
    role: varchar('role', { length: 32 }).notNull().default('PENDING'),
    profileImageKey: varchar('profile_image_key', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('users_nickname_unique').on(table.nickname),
    unique('users_email_unique').on(table.email),
  ],
);
