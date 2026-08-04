import { bigint, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';
import { posts } from './post.table';

/** A user's single like for a post. */
export const postLikes = pgTable(
  'post_likes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('post_likes_post_user_unique').on(table.postId, table.userId)],
);
