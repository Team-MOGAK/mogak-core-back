import { bigint, boolean, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { consentItems } from './consentItem.table';
import { users } from './user.table';

/** A user's acceptance state for one consent item. */
export const userConsents = pgTable(
  'user_consent',
  {
    id: bigint('user_consent_id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    consentItemId: bigint('consent_item_id', { mode: 'number' })
      .notNull()
      .references(() => consentItems.id),
    agreed: boolean('agreed').notNull(),
    agreedAt: timestamp('agreed_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_user_consent_user_item').on(table.userId, table.consentItemId)],
);
