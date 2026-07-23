import { HttpStatus } from '@nestjs/common';

export type ErrorDefinition = Readonly<{
  httpStatus: HttpStatus;
  code: string;
  message: string;
}>;

export const AppErrorCode = {
  USER_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    code: 'U001',
    message: '존재하지 않는 사용자입니다',
  },
  JOB_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    code: 'U002',
    message: '존재하지 않는 직업입니다',
  },
  ADDRESS_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    code: 'U003',
    message: '존재하지 않는 지역입니다',
  },
  INVALID_NICKNAME: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'U004',
    message: '올바른 닉네임이 아닙니다',
  },
  INVALID_EMAIL: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'U005',
    message: '올바르지 않은 이메일 형식입니다',
  },
  USER_ALREADY_EXISTS: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'U006',
    message: '이미 존재하는 유저입니다',
  },
  UNSUPPORTED_SOCIAL_PROVIDER: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U008',
    message: '지원하지 않는 소셜 로그인 공급자입니다',
  },
  INVALID_SOCIAL_TOKEN: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U009',
    message: '소셜 로그인 토큰이 올바르지 않습니다',
  },
  SOCIAL_EMAIL_REQUIRED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U010',
    message: '소셜 로그인 이메일 정보가 필요합니다',
  },
  SOCIAL_ACCOUNT_CONFLICT: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'U011',
    message: '이미 연결된 소셜 계정이 있습니다',
  },
  SOCIAL_ACCOUNT_LINK_REQUIRED: {
    httpStatus: HttpStatus.CONFLICT,
    code: 'U012',
    message: '기존 계정에 소셜 계정 연결이 필요합니다',
  },
  SOCIAL_EMAIL_NOT_VERIFIED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U013',
    message: '소셜 로그인 이메일 검증이 필요합니다',
  },
  CONSENT_ITEM_NOT_FOUND: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U014',
    message: '존재하지 않는 동의 항목입니다',
  },
  CONSENT_ITEM_INACTIVE: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U015',
    message: '비활성화된 동의 항목입니다',
  },
  DUPLICATE_CONSENT_ITEM: {
    httpStatus: HttpStatus.BAD_REQUEST,
    code: 'U016',
    message: '중복된 동의 항목입니다',
  },
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
  WRONG_TOKEN: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    code: 'T001',
    message: '잘못된 형식의 토큰입니다',
  },
  EXPIRED_TOKEN: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    code: 'T002',
    message: '만료된 토큰입니다',
  },
  EMPTY_TOKEN: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    code: 'T003',
    message: '토큰이 존재하지 않습니다',
  },
  FORBIDDEN: {
    httpStatus: HttpStatus.FORBIDDEN,
    code: 'T004',
    message: '권한이 부여되지 않았습니다',
  },
  LOGOUT_TOKEN: {
    httpStatus: HttpStatus.FORBIDDEN,
    code: 'T005',
    message: '로그아웃된 토큰입니다',
  },
  UNAUTHORIZED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    code: 'T001',
    message: '잘못된 형식의 토큰입니다',
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
  STORAGE_DISABLED: {
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'Z006',
    message: '스토리지 기능이 비활성화되어 있습니다',
  },
  INTERNAL_SERVER_ERROR: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'Z500',
    message: '서버와의 연결에 실패했습니다',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];
