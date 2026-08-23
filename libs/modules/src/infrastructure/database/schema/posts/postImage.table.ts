import { bigint, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { posts } from './post.table';

/** Ordered image stored for a post. */
export const postImages = pgTable(
  'post_img',
  {
    id: bigint('post_img_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    postId: bigint('post_id', { mode: 'number' })
      .notNull()
      .references(() => posts.id),
    storageKey: varchar('img_url', { length: 512 }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_post_img_post_id').on(table.postId)],
);
