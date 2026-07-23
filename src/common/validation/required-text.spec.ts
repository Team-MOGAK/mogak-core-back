import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';
import { requiredTrimmed } from './required-text';

describe('필수 문자열 정규화', () => {
  it('공백만 있는 필수 문자열을 잘못된 파라미터로 거부한다', () => {
    expect(() => requiredTrimmed('   ')).toThrow(new AppException(AppErrorCode.INVALID_PARAMETER));
  });

  it('필수 문자열의 앞뒤 공백을 제거한다', () => {
    expect(requiredTrimmed('  모각러  ')).toBe('모각러');
  });
});
