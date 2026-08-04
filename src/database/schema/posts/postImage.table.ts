import { bigint, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { posts } from './post.table';

/** Ordered image stored for a post. */
export const postImages = pgTable('post_images', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  postId: bigint('post_id', { mode: 'number' })
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 512 }).notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
