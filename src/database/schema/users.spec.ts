import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  authSessions,
  consentItems,
  socialAccounts,
  userConsents,
  users,
} from './users';

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.getName())
    .filter((name): name is string => name !== undefined);
}

describe('users/auth schema', () => {
  it('uses relational bigint IDs and UUID session IDs', () => {
    expect(users.id.dataType).toBe('number');
    expect(authSessions.id.dataType).toBe('string');
    expect(userConsents.userId.notNull).toBe(true);
  });

  it('defines only the user and consent uniqueness rules required for correctness', () => {
    expect(uniqueConstraintNames(users)).toEqual(
      expect.arrayContaining(['users_nickname_unique', 'users_email_unique']),
    );
    expect(uniqueConstraintNames(consentItems)).toContain('consent_items_code_unique');
    expect(uniqueConstraintNames(userConsents)).toContain('user_consents_user_item_unique');
    expect(uniqueConstraintNames(socialAccounts)).toEqual(
      expect.arrayContaining([
        'social_accounts_provider_user_unique',
        'social_accounts_user_provider_unique',
      ]),
    );
  });
});
