import { bigint, index, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';

/** Directed follow relation between users. */
export const follows = pgTable(
  'follow',
  {
    id: bigint('follow_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    followerId: bigint('from_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    followingId: bigint('to_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_follow_from_to').on(table.followerId, table.followingId),
    index('idx_follow_to_id').on(table.followingId),
  ],
);
