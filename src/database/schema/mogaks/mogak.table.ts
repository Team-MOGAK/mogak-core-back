import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { modarats } from './modarat.table';
import { mogakCategories } from './mogakCategory.table';

/** A category-labelled study collection inside a Modarat. */
export const mogaks = pgTable('mogaks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  modaratId: bigint('modarat_id', { mode: 'number' })
    .notNull()
    .references(() => modarats.id, { onDelete: 'cascade' }),
  categoryId: bigint('category_id', { mode: 'number' }).references(() => mogakCategories.id),
  customCategoryName: varchar('custom_category_name', { length: 200 }),
  title: varchar('title', { length: 100 }).notNull(),
  color: varchar('color', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
