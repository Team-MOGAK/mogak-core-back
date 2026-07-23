import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AppErrorCode } from './app-error-code';

describe('AppErrorCode', () => {
  it('keeps the existing social-account link-required contract', () => {
    expect(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'U012',
      message: '기존 계정에 소셜 계정 연결이 필요합니다',
    });
  });

  it('keeps the existing logged-out token contract', () => {
    expect(AppErrorCode.LOGOUT_TOKEN).toMatchObject({
      httpStatus: HttpStatus.FORBIDDEN,
      code: 'T005',
      message: '로그아웃된 토큰입니다',
    });
  });
});
