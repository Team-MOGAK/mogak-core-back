import { type ArgumentMetadata } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AppErrorCode } from '../http/app-error-code';
import { DomainException } from '../http/domain.exception';
import { AppZodValidationPipe } from './zod-validation.pipe';

class PositiveIdDto extends createZodDto(
  z.object({ id: z.coerce.number().int().positive().refine(Number.isSafeInteger) }).strict(),
) {}

describe('앱 Zod 검증 Pipe', () => {
  const metadata: ArgumentMetadata = { type: 'body', metatype: PositiveIdDto };

  it('양의 정수 문자열을 number로 변환한다', () => {
    expect(new AppZodValidationPipe().transform({ id: '7' }, metadata)).toEqual({
      id: 7,
    });
  });

  it('잘못된 값과 정의되지 않은 필드를 Z005로 변환한다', () => {
    expect(() =>
      new AppZodValidationPipe().transform({ id: '0', unexpected: true }, metadata),
    ).toThrow(new DomainException(AppErrorCode.INVALID_PARAMETER));
  });
});
