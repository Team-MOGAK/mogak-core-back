import { getTableConfig } from 'drizzle-orm/pg-core';

import { authSessions, consentItems, socialAccounts, userConsents, users } from './users';

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.getName())
    .filter((name): name is string => name !== undefined);
}

describe('사용자와 인증 데이터베이스 스키마', () => {
  it('관계형 bigint 식별자와 UUID 세션 식별자를 사용한다', () => {
    expect(users.id.dataType).toBe('number');
    expect(authSessions.id.dataType).toBe('string');
    expect(userConsents.userId.notNull).toBe(true);
  });

  it('정합성에 필요한 사용자와 동의 고유성 규칙만 정의한다', () => {
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
