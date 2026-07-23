import { HttpStatus } from '@nestjs/common';

export type ErrorDefinition = Readonly<{
  httpStatus: HttpStatus;
  code: string;
  message: string;
}>;

export const AppErrorCode = {
  BAD_REQUEST: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'Z002',
    message: '잘못된 요청입니다',
  },
  INVALID_PARAMETER: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'Z005',
    message: '입력값이 유효하지 않습니다',
  },
  UNAUTHORIZED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    code: 'T001',
    message: '잘못된 형식의 토큰입니다',
  },
  FORBIDDEN: {
    httpStatus: HttpStatus.FORBIDDEN,
    code: 'T004',
    message: '권한이 부여되지 않았습니다',
  },
  NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    code: 'Z003',
    message: '찾을 수 없습니다',
  },
  CONFLICT: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'Z002',
    message: '잘못된 요청입니다',
  },
  METHOD_NOT_ALLOWED: {
    httpStatus: HttpStatus.METHOD_NOT_ALLOWED,
    code: 'Z004',
    message: '지원하지 않는 HTTP Method 요청입니다.',
  },
  INTERNAL_SERVER_ERROR: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'Z500',
    message: '서버와의 연결에 실패했습니다',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];
