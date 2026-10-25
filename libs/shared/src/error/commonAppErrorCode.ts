import type { ErrorDefinition } from './errorDefinition';

export const CommonAppErrorCode = {
  BAD_REQUEST: { httpStatus: 400, code: 'Z002', message: '잘못된 요청입니다' },
  INVALID_PARAMETER: { httpStatus: 400, code: 'Z005', message: '입력값이 유효하지 않습니다' },
  NOT_FOUND: { httpStatus: 404, code: 'Z003', message: '찾을 수 없습니다' },
  CONFLICT: { httpStatus: 409, code: 'Z002', message: '잘못된 요청입니다' },
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
  INTERNAL_SERVER_ERROR: { httpStatus: 500, code: 'Z500', message: '서버와의 연결에 실패했습니다' },
  STORAGE_DISABLED: {
    httpStatus: 503,
    code: 'Z006',
    message: '스토리지 기능이 비활성화되어 있습니다',
  },
} as const satisfies Record<string, ErrorDefinition>;
