import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const jobs = pgTable('jobs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const addresses = pgTable('addresses', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const consentItems = pgTable(
  'consent_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    required: boolean('required').notNull(),
    active: boolean('active').notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [unique('consent_items_code_unique').on(table.code)],
);

export const users = pgTable(
  'users',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    jobId: bigint('job_id', { mode: 'number' }).references(() => jobs.id),
    addressId: bigint('address_id', { mode: 'number' }).references(() => addresses.id),
    nickname: varchar('nickname', { length: 255 }),
    email: varchar('email', { length: 255 }),
    gender: varchar('gender', { length: 1 }),
    age: integer('age'),
    role: varchar('role', { length: 32 }).notNull().default('PENDING'),
    profileImageKey: varchar('profile_image_key', { length: 512 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique('users_nickname_unique').on(table.nickname),
    unique('users_email_unique').on(table.email),
  ],
);

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
    createdAt,
    updatedAt,
  },
  (table) => [unique('user_consents_user_item_unique').on(table.userId, table.consentItemId)],
);

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
    createdAt,
    updatedAt,
  },
  (table) => [
    unique('social_accounts_provider_user_unique').on(table.provider, table.providerUserId),
    unique('social_accounts_user_provider_unique').on(table.userId, table.provider),
  ],
);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt,
  updatedAt,
});
