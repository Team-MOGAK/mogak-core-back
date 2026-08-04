import { bigint, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jogakExecutions } from '../mogaks/jogakExecution.table';
import { users } from '../users/user.table';

/** A post made for one Jogak execution. */
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('posts_jogak_execution_id_unique').on(table.jogakExecutionId)],
);
