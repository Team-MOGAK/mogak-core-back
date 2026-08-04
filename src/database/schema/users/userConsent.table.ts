import { bigint, boolean, pgTable, timestamp, unique } from 'drizzle-orm/pg-core';

import { consentItems } from './consentItem.table';
import { users } from './user.table';

/** A user's acceptance state for one consent item. */
export const userConsents = pgTable(
  'user_consents',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentItemId: bigint('consent_item_id', { mode: 'number' })
      .notNull()
      .references(() => consentItems.id),
    agreed: boolean('agreed').notNull(),
    agreedAt: timestamp('agreed_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('user_consents_user_item_unique').on(table.userId, table.consentItemId)],
);
