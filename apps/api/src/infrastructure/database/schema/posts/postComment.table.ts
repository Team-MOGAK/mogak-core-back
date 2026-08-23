import { bigint, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';
import { posts } from './post.table';

/** Comment written by a user on a post. */
export const postComments = pgTable(
  'post_comment',
  {
    id: bigint('comment_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id),
    authorId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    contents: varchar('contents', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_post_comment_post_id').on(table.postId),
    index('idx_post_comment_user_id').on(table.authorId),
  ],
);
