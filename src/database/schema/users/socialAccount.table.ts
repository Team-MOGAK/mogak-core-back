import { bigint, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { users } from './user.table';

/** Provider account linked to one user. */
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('social_accounts_provider_user_unique').on(table.provider, table.providerUserId),
    unique('social_accounts_user_provider_unique').on(table.userId, table.provider),
  ],
);
