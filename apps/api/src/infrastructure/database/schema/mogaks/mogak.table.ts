import { bigint, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { modarats } from './modarat.table';
import { mogakCategories } from './mogakCategory.table';

/** A category-labelled study collection inside a Modarat. */
export const mogaks = pgTable('mogak', {
  id: bigint('mogak_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  modaratId: bigint('modarat_id', { mode: 'number' })
    .notNull()
    .references(() => modarats.id),
  categoryId: integer('big_category').references(() => mogakCategories.id),
  customCategoryName: varchar('small_category', { length: 200 }),
  title: varchar('title', { length: 100 }).notNull(),
  color: varchar('color', { length: 100 }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
