import type { ErrorDefinition } from './errorDefinition';

export const UserAppErrorCode = {
  USER_NOT_FOUND: { httpStatus: 404, code: 'U001', message: '존재하지 않는 사용자입니다' },
  JOB_NOT_FOUND: { httpStatus: 404, code: 'U002', message: '존재하지 않는 직업입니다' },
  ADDRESS_NOT_FOUND: { httpStatus: 404, code: 'U003', message: '존재하지 않는 지역입니다' },
  INVALID_NICKNAME: { httpStatus: 409, code: 'U004', message: '올바른 닉네임이 아닙니다' },
  INVALID_EMAIL: { httpStatus: 409, code: 'U005', message: '올바르지 않은 이메일 형식입니다' },
  USER_ALREADY_EXISTS: { httpStatus: 409, code: 'U006', message: '이미 존재하는 유저입니다' },
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
} as const satisfies Record<string, ErrorDefinition>;
