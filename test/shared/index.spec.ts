import { describe, expect, it } from '@jest/globals';

import { AppErrorCode, LogEvent, LogEventSummary } from '@mogak/shared';

describe('@mogak/shared 공개 메타데이터', () => {
  it('AppErrorCode를 단일 원본으로 유지하고 의도한 alias를 보존한다', () => {
    expect(AppErrorCode.WRONG_TOKEN).toEqual(AppErrorCode.UNAUTHORIZED);
    expect(AppErrorCode.BAD_REQUEST).toMatchObject({
      httpStatus: 400,
      code: AppErrorCode.CONFLICT.code,
      message: AppErrorCode.CONFLICT.message,
    });
    expect(AppErrorCode.STORAGE_DISABLED).toMatchObject({
      httpStatus: 503,
      code: 'Z006',
    });
  });

  it('로그 이벤트와 고정 공개 요약을 같은 registry에서 제공한다', () => {
    expect(Object.values(LogEvent)).toEqual([
      'domain_exception',
      'http_exception',
      'unhandled_exception',
      'http_request_failed',
      'database_pool_error',
      'unknown_error',
    ]);
    expect(LogEventSummary[LogEvent.HTTP_REQUEST_FAILED]).toBe('HTTP request failed');
    expect(LogEventSummary[LogEvent.UNKNOWN_ERROR]).toBe('Unknown API error');
  });
});
