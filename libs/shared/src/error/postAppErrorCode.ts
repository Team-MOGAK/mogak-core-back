import type { ErrorDefinition } from './errorDefinition';

export const PostAppErrorCode = {
  POST_CONTENTS_TOO_LONG: {
    httpStatus: 400,
    code: 'P001',
    message: '최대 글자수 350자를 초과하였습니다',
  },
  POST_NOT_FOUND: { httpStatus: 404, code: 'P003', message: '존재하지 않는 게시물입니다' },
  POST_ALREADY_EXISTS: { httpStatus: 409, code: 'P005', message: '이미 존재하는 회고록입니다' },
  COMMENT_CONTENTS_TOO_LONG: {
    httpStatus: 400,
    code: 'C001',
    message: '최대 글자수 200자를 초과하였습니다',
  },
  COMMENT_NOT_FOUND: { httpStatus: 404, code: 'C002', message: '존재하지 않는 댓글입니다' },
} as const satisfies Record<string, ErrorDefinition>;
