import { bigint, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';

/** Directed follow relation between users. */
export const follows = pgTable(
  'follows',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    followerId: bigint('follower_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: bigint('following_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('follows_follower_following_unique').on(table.followerId, table.followingId)],
);
