import { HttpStatus } from '@nestjs/common';

import type { AppErrorCode } from './appErrorCode';

export type ApiResponse<T> = {
  time: string;
  status: string;
  code: string;
  message: string;
  result?: T;
};

const kstFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function timestamp(clock: Date): string {
  return kstFormatter.format(clock).replace(',', '');
}

export function successResponse<T>(
  result: T,
  httpStatus: HttpStatus = HttpStatus.OK,
  clock: Date = new Date(),
): ApiResponse<T> {
  const created = httpStatus === HttpStatus.CREATED;

  return {
    time: timestamp(clock),
    status: HttpStatus[httpStatus],
    code: created ? 'created' : 'success',
    message: created
      ? '요청에 성공했으며 리소스가 정상적으로 생성되었습니다.'
      : '요청에 성공했습니다.',
    result,
  };
}

export function errorResponse(error: AppErrorCode, clock: Date = new Date()): ApiResponse<never> {
  return {
    time: timestamp(clock),
    status: HttpStatus[error.httpStatus],
    code: error.code,
    message: error.message,
  };
}
