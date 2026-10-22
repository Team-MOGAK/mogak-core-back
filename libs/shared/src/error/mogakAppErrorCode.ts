import type { ErrorDefinition } from './errorDefinition';

export const MogakAppErrorCode = {
  MODARAT_NOT_FOUND: { httpStatus: 400, code: 'A001', message: '존재하지 않는 모다라트입니다' },
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
  MOGAK_NOT_FOUND: { httpStatus: 404, code: 'M004', message: '존재하지 않는 모각입니다' },
  JOGAK_NOT_FOUND: { httpStatus: 404, code: 'J005', message: '존재하지 않는 조각입니다' },
  INVALID_SCHEDULE: { httpStatus: 400, code: 'J009', message: '유효하지 않은 반복주기입니다' },
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
  INVALID_TARGET_DATE: { httpStatus: 400, code: 'J017', message: '유효하지 않은 실천 날짜입니다' },
} as const satisfies Record<string, ErrorDefinition>;
