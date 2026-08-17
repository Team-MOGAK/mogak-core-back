import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { baseUuidPrimaryKey } from '../common';
import { users } from './user.table';

/** Refresh-token session owned by one user. */
export const authSessions = pgTable('auth_sessions', {
  id: baseUuidPrimaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
