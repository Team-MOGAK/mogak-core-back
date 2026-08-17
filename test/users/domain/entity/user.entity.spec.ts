import {
  canCompleteRegistration,
  normalizeNickname,
} from '@core/users/domain/policy/userRegistration.policy';

describe('User domain rules', () => {
  it('allows only a pending principal to complete a pending user registration', () => {
    expect(canCompleteRegistration('PENDING', 'PENDING')).toBe(true);
    expect(canCompleteRegistration('USER', 'PENDING')).toBe(false);
    expect(canCompleteRegistration('PENDING', 'USER')).toBe(false);
  });

  it('trims a nickname and rejects a nonblank nickname requirement', () => {
    expect(normalizeNickname('  모각러  ')).toBe('모각러');
    expect(normalizeNickname('   ')).toBeNull();
  });
});
