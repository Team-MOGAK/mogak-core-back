export type ErrorDefinition = Readonly<{
  httpStatus: number;
  code: string;
  message: string;
}>;

/**
 * Public application error metadata. Keep this registry as the single source
 * of truth for API responses and alert presentation; consumers must not copy
 * individual code or message maps.
 */
export const AppErrorCode = {
  USER_NOT_FOUND: {
    httpStatus: 404,
    code: 'U001',
    message: '존재하지 않는 사용자입니다',
  },
  JOB_NOT_FOUND: {
    httpStatus: 404,
    code: 'U002',
    message: '존재하지 않는 직업입니다',
  },
  ADDRESS_NOT_FOUND: {
    httpStatus: 404,
    code: 'U003',
    message: '존재하지 않는 지역입니다',
  },
  INVALID_NICKNAME: {
    httpStatus: 409,
    code: 'U004',
    message: '올바른 닉네임이 아닙니다',
  },
  INVALID_EMAIL: {
    httpStatus: 409,
    code: 'U005',
    message: '올바르지 않은 이메일 형식입니다',
  },
  USER_ALREADY_EXISTS: {
    httpStatus: 409,
    code: 'U006',
    message: '이미 존재하는 유저입니다',
  },
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
  CONSENT_ITEM_NOT_FOUND: {
    httpStatus: 400,
    code: 'U014',
    message: '존재하지 않는 동의 항목입니다',
  },
  CONSENT_ITEM_INACTIVE: {
    httpStatus: 400,
    code: 'U015',
    message: '비활성화된 동의 항목입니다',
  },
  DUPLICATE_CONSENT_ITEM: {
    httpStatus: 400,
    code: 'U016',
    message: '중복된 동의 항목입니다',
  },
  MODARAT_NOT_FOUND: {
    httpStatus: 400,
    code: 'A001',
    message: '존재하지 않는 모다라트입니다',
  },
  MODARAT_TITLE_TOO_LONG: {
    httpStatus: 400,
    code: 'A002',
    message: '모다라트 최대 글자수 100자를 초과하였습니다',
  },
  MOGAK_CATEGORY_NOT_FOUND: {
    httpStatus: 404,
    code: 'M001',
    message: '존재하지 않는 카테고리입니다',
  },
  CUSTOM_CATEGORY_REQUIRED: {
    httpStatus: 400,
    code: 'M002',
    message: '기타 카테고리가 존재하지 않습니다',
  },
  INVALID_EXECUTION_TRANSITION: {
    httpStatus: 400,
    code: 'M003',
    message: '잘못된 상태 변경입니다',
  },
  MOGAK_NOT_FOUND: {
    httpStatus: 404,
    code: 'M004',
    message: '존재하지 않는 모각입니다',
  },
  JOGAK_NOT_FOUND: {
    httpStatus: 404,
    code: 'J005',
    message: '존재하지 않는 조각입니다',
  },
  INVALID_SCHEDULE: {
    httpStatus: 400,
    code: 'J009',
    message: '유효하지 않은 반복주기입니다',
  },
  INVALID_OCCURRENCE: {
    httpStatus: 400,
    code: 'J010',
    message: '유효하지 않은 루틴의 조각입니다',
  },
  MAX_MOGAKS: {
    httpStatus: 409,
    code: 'J012',
    message: '생성 가능한 모각의 최대 갯수는 8개 입니다',
  },
  ROUTINE_WEEKDAYS_REQUIRED: {
    httpStatus: 409,
    code: 'J013',
    message: '루틴이 설정된 경우 요일이 필요합니다',
  },
  INVALID_TARGET_DATE: {
    httpStatus: 400,
    code: 'J017',
    message: '유효하지 않은 실천 날짜입니다',
  },
  POST_CONTENTS_TOO_LONG: {
    httpStatus: 400,
    code: 'P001',
    message: '최대 글자수 350자를 초과하였습니다',
  },
  POST_NOT_FOUND: {
    httpStatus: 404,
    code: 'P003',
    message: '존재하지 않는 게시물입니다',
  },
  POST_ALREADY_EXISTS: {
    httpStatus: 409,
    code: 'P005',
    message: '이미 존재하는 회고록입니다',
  },
  COMMENT_CONTENTS_TOO_LONG: {
    httpStatus: 400,
    code: 'C001',
    message: '최대 글자수 200자를 초과하였습니다',
  },
  COMMENT_NOT_FOUND: {
    httpStatus: 404,
    code: 'C002',
    message: '존재하지 않는 댓글입니다',
  },
  FOLLOW_ALREADY_EXISTS: {
    httpStatus: 409,
    code: 'F001',
    message: '이미 존재하는 팔로우입니다',
  },
  FOLLOW_NOT_FOUND: {
    httpStatus: 404,
    code: 'F002',
    message: '존재하지 않는 팔로우입니다',
  },
  BAD_REQUEST: {
    httpStatus: 400,
    code: 'Z002',
    message: '잘못된 요청입니다',
  },
  INVALID_PARAMETER: {
    httpStatus: 400,
    code: 'Z005',
    message: '입력값이 유효하지 않습니다',
  },
  WRONG_TOKEN: {
    httpStatus: 401,
    code: 'T001',
    message: '잘못된 형식의 토큰입니다',
  },
  EXPIRED_TOKEN: {
    httpStatus: 401,
    code: 'T002',
    message: '만료된 토큰입니다',
  },
  EMPTY_TOKEN: {
    httpStatus: 401,
    code: 'T003',
    message: '토큰이 존재하지 않습니다',
  },
  FORBIDDEN: {
    httpStatus: 403,
    code: 'T004',
    message: '권한이 부여되지 않았습니다',
  },
  TOKEN_REFRESH_REQUIRED: {
    httpStatus: 403,
    code: 'T006',
    message: '최신 권한 토큰으로 갱신이 필요합니다',
  },
  LOGOUT_TOKEN: {
    httpStatus: 403,
    code: 'T005',
    message: '로그아웃된 토큰입니다',
  },
  UNAUTHORIZED: {
    httpStatus: 401,
    code: 'T001',
    message: '잘못된 형식의 토큰입니다',
  },
  NOT_FOUND: {
    httpStatus: 404,
    code: 'Z003',
    message: '찾을 수 없습니다',
  },
  CONFLICT: {
    httpStatus: 409,
    code: 'Z002',
    message: '잘못된 요청입니다',
  },
  METHOD_NOT_ALLOWED: {
    httpStatus: 405,
    code: 'Z004',
    message: '지원하지 않는 HTTP Method 요청입니다.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    httpStatus: 415,
    code: 'Z007',
    message: '지원하지 않는 Content-Type입니다.',
  },
  STORAGE_DISABLED: {
    httpStatus: 503,
    code: 'Z006',
    message: '스토리지 기능이 비활성화되어 있습니다',
  },
  INTERNAL_SERVER_ERROR: {
    httpStatus: 500,
    code: 'Z500',
    message: '서버와의 연결에 실패했습니다',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export const LogEvent = {
  DOMAIN_EXCEPTION: 'domain_exception',
  HTTP_EXCEPTION: 'http_exception',
  UNHANDLED_EXCEPTION: 'unhandled_exception',
  HTTP_REQUEST_FAILED: 'http_request_failed',
  DATABASE_POOL_ERROR: 'database_pool_error',
  UNKNOWN_ERROR: 'unknown_error',
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];

export const LogEventSummary: Readonly<Record<LogEvent, string>> = {
  domain_exception: 'API domain failure',
  http_exception: 'API HTTP failure',
  unhandled_exception: 'Unhandled API exception',
  http_request_failed: 'HTTP request failed',
  database_pool_error: 'Database pool failure',
  unknown_error: 'Unknown API error',
};
