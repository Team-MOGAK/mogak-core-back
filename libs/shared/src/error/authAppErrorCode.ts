import type { ErrorDefinition } from './errorDefinition';

export const AuthAppErrorCode = {
  UNSUPPORTED_SOCIAL_PROVIDER: {
    httpStatus: 400,
    code: 'U008',
    message: '지원하지 않는 소셜 로그인 공급자입니다',
  },
  INVALID_SOCIAL_TOKEN: {
    httpStatus: 400,
    code: 'U009',
    message: '소셜 로그인 토큰이 올바르지 않습니다',
  },
  SOCIAL_EMAIL_REQUIRED: {
    httpStatus: 400,
    code: 'U010',
    message: '소셜 로그인 이메일 정보가 필요합니다',
  },
  SOCIAL_ACCOUNT_CONFLICT: {
    httpStatus: 409,
    code: 'U011',
    message: '이미 연결된 소셜 계정이 있습니다',
  },
  SOCIAL_ACCOUNT_LINK_REQUIRED: {
    httpStatus: 409,
    code: 'U012',
    message: '기존 계정에 소셜 계정 연결이 필요합니다',
  },
  SOCIAL_EMAIL_NOT_VERIFIED: {
    httpStatus: 400,
    code: 'U013',
    message: '소셜 로그인 이메일 검증이 필요합니다',
  },
  WRONG_TOKEN: { httpStatus: 401, code: 'T001', message: '잘못된 형식의 토큰입니다' },
  EXPIRED_TOKEN: { httpStatus: 401, code: 'T002', message: '만료된 토큰입니다' },
  EMPTY_TOKEN: { httpStatus: 401, code: 'T003', message: '토큰이 존재하지 않습니다' },
  FORBIDDEN: { httpStatus: 403, code: 'T004', message: '권한이 부여되지 않았습니다' },
  LOGOUT_TOKEN: { httpStatus: 403, code: 'T005', message: '로그아웃된 토큰입니다' },
  TOKEN_REFRESH_REQUIRED: {
    httpStatus: 403,
    code: 'T006',
    message: '최신 권한 토큰으로 갱신이 필요합니다',
  },
  UNAUTHORIZED: { httpStatus: 401, code: 'T001', message: '잘못된 형식의 토큰입니다' },
} as const satisfies Record<string, ErrorDefinition>;
