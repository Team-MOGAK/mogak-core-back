import { z } from 'zod';

import { DomainException } from '@core/common/error/domainException';
import { parseMultipartJson } from '@api/common/validation/multipartJson';

const postSchema = z
  .object({
    targetDate: z.iso.date(),
    contents: z.string().min(1).max(350).regex(/\S/),
  })
  .strict();

describe('multipart JSON 어댑터', () => {
  it('일반 JSON과 request 문자열을 같은 검증 결과로 반환한다', () => {
    expect(parseMultipartJson({ targetDate: '2026-07-24', contents: '회고' }, postSchema)).toEqual({
      targetDate: '2026-07-24',
      contents: '회고',
    });
    expect(
      parseMultipartJson(
        { request: JSON.stringify({ targetDate: '2026-07-24', contents: '회고' }) },
        postSchema,
      ),
    ).toEqual({ targetDate: '2026-07-24', contents: '회고' });
  });

  it('손상 JSON과 정의되지 않은 필드를 Z005로 거부한다', () => {
    expect(() => parseMultipartJson({ request: '{' }, postSchema)).toThrow(
      new DomainException('INVALID_PARAMETER'),
    );
    expect(() =>
      parseMultipartJson(
        {
          request: JSON.stringify({
            targetDate: '2026-07-24',
            contents: '회고',
            extra: true,
          }),
        },
        postSchema,
      ),
    ).toThrow(new DomainException('INVALID_PARAMETER'));
  });
});
