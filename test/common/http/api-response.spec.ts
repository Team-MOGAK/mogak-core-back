import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { errorResponse, successResponse } from '../../../src/common/http/api-response';

describe('응답 생성기', () => {
  it('스프링 성공 응답 포맷을 유지한다', () => {
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

  it('오류 응답에는 result 필드를 포함하지 않는다', () => {
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
