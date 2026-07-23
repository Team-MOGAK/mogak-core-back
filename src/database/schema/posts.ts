import { bigint, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jogakExecutions } from './mogaks';
import { users } from './users';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const posts = pgTable(
  'posts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jogakExecutionId: bigint('jogak_execution_id', { mode: 'number' })
      .notNull()
      .references(() => jogakExecutions.id, { onDelete: 'cascade' }),
    authorId: bigint('author_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contents: varchar('contents', { length: 350 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [unique('posts_jogak_execution_id_unique').on(table.jogakExecutionId)],
);

export const postImages = pgTable('post_images', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 512 }).notNull(),
  position: integer('position').notNull(),
  createdAt,
  updatedAt,
});

export const postComments = pgTable('post_comments', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  authorId: bigint('author_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contents: varchar('contents', { length: 200 }).notNull(),
  createdAt,
  updatedAt,
});

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
    createdAt,
  },
  (table) => [unique('post_likes_post_user_unique').on(table.postId, table.userId)],
);
