import {
  canCompleteRegistration,
  normalizeNickname,
  registrationRoleFor,
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

  it.each([
    ['모든 가입 필수 정보가 있는 경우', '  모각러  ', 1, 1, [true], 'USER'],
    ['한 글자 nickname', '가', 1, 1, [true], 'PENDING'],
    ['job 누락', '모각러', null, 1, [true], 'PENDING'],
    ['address 누락', '모각러', 1, null, [true], 'PENDING'],
    ['필수 동의 미동의', '모각러', 1, 1, [false], 'PENDING'],
  ])(
    '%s이면 가입 역할을 %s로 판별한다',
    (_caseName, nickname, jobId, addressId, consents, role) => {
      expect(
        registrationRoleFor({
          nickname,
          jobId,
          addressId,
          requiredConsentAgreements: consents,
        }),
      ).toBe(role);
    },
  );
});
