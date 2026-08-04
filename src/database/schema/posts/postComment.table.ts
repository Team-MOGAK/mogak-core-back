import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { users } from '../users/user.table';
import { posts } from './post.table';

/** Comment written by a user on a post. */
export const postComments = pgTable('post_comments', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  authorId: bigint('author_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contents: varchar('contents', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
