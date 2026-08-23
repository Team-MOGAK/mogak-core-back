import { bigint, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';
import { posts } from './post.table';

/** A user's single like for a post. */
export const postLikes = pgTable(
  'post_like',
  {
    id: bigint('like_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_post_like_post_user').on(table.postId, table.userId)],
);
