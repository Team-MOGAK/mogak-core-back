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

  it('keeps the public Mogak and Jogak error contracts needed by virtual executions', () => {
    const codes = AppErrorCode as Record<string, unknown>;

    expect(codes.MODARAT_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'A001',
      message: '존재하지 않는 모다라트입니다',
    });
    expect(codes.MOGAK_CATEGORY_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'M001',
      message: '존재하지 않는 카테고리입니다',
    });
    expect(codes.CUSTOM_CATEGORY_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'M002',
      message: '기타 카테고리가 존재하지 않습니다',
    });
    expect(codes.MOGAK_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'M004',
      message: '존재하지 않는 모각입니다',
    });
    expect(codes.JOGAK_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'J005',
      message: '존재하지 않는 조각입니다',
    });
    expect(codes.INVALID_SCHEDULE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J009',
      message: '유효하지 않은 반복주기입니다',
    });
    expect(codes.INVALID_OCCURRENCE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J010',
      message: '유효하지 않은 루틴의 조각입니다',
    });
    expect(codes.MAX_MOGAKS).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'J012',
      message: '생성 가능한 모각의 최대 갯수는 8개 입니다',
    });
    expect(codes.ROUTINE_WEEKDAYS_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'J013',
      message: '루틴이 설정된 경우 요일이 필요합니다',
    });
    expect(codes.INVALID_TARGET_DATE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J017',
      message: '유효하지 않은 실천 날짜입니다',
    });
    expect(codes.INVALID_EXECUTION_TRANSITION).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'M003',
      message: '잘못된 상태 변경입니다',
    });
  });
});
