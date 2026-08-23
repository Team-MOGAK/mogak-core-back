import { bigint, index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';

/** A post made for one Jogak execution. */
export const posts = pgTable(
  'post',
  {
    id: bigint('post_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    // This retains the historical execution ID after its Jogak hierarchy is deleted.
    jogakExecutionId: bigint('daily_jogak_id', { mode: 'number' }).notNull(),
    authorId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    contents: varchar('contents', { length: 350 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_post_daily_jogak').on(table.jogakExecutionId),
    index('idx_post_user_id').on(table.authorId),
  ],
);
