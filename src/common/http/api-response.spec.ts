import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AppErrorCode } from './app-error-code';
import { errorResponse, successResponse } from './api-response';

describe('HTTP response builders', () => {
  it('keeps the Spring success envelope', () => {
    expect(
      successResponse({ id: 1 }, HttpStatus.CREATED, new Date('2026-07-23T00:00:00Z')),
    ).toEqual({
      time: '2026-07-23 09:00:00',
      status: 'CREATED',
      code: 'created',
      message: '요청에 성공했으며 리소스가 정상적으로 생성되었습니다.',
      result: { id: 1 },
    });
  });

  it('does not include result for an error', () => {
    expect(errorResponse(AppErrorCode.INVALID_PARAMETER, new Date('2026-07-23T00:00:00Z'))).toEqual(
      {
        time: '2026-07-23 09:00:00',
        status: 'BAD_REQUEST',
        code: 'Z005',
        message: '입력값이 유효하지 않습니다',
      },
    );
  });
});
