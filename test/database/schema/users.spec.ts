import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  authSessions,
  consentItems,
  socialAccounts,
  userConsents,
  users,
} from '@infra/database/schema/users';

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.getName())
    .filter((name): name is string => name !== undefined);
}

describe('사용자와 인증 데이터베이스 스키마', () => {
  it('관계형 bigint 식별자와 UUID 세션 식별자를 사용한다', () => {
    expect(users.id.dataType).toBe('number');
    expect(users.id.name).toBe('user_id');
    expect(users.profileImageKey.name).toBe('profile_img_url');
    expect(getTableConfig(socialAccounts).name).toBe('social_account');
    expect(socialAccounts.id.name).toBe('social_account_id');
    expect(authSessions.id.dataType).toBe('string');
    expect(userConsents.userId.notNull).toBe(true);
  });

  it('정합성에 필요한 사용자와 동의 고유성 규칙만 정의한다', () => {
    expect(uniqueConstraintNames(users)).toEqual(['users_nickname_unique']);
    expect(uniqueConstraintNames(consentItems)).toContain('uq_consent_item_code');
    expect(uniqueConstraintNames(userConsents)).toContain('uq_user_consent_user_item');
    expect(uniqueConstraintNames(socialAccounts)).toEqual(
      expect.arrayContaining([
        'uq_social_account_provider_user',
        'uq_social_account_user_provider',
      ]),
    );
  });
});
