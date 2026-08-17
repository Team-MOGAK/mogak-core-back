import { type ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { zodParsePipe } from '@api/common/validation/zodParameter.decorator';

const idSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const metadata: ArgumentMetadata = { type: 'body' };

describe('Zod 파라미터 검증 Pipe', () => {
  it('스키마로 양의 정수 문자열을 number로 변환한다', () => {
    expect(zodParsePipe(idSchema).transform({ id: '7' }, metadata)).toEqual({ id: 7 });
  });

  it('잘못된 값과 정의되지 않은 필드를 Z005로 거부한다', () => {
    expect(() => zodParsePipe(idSchema).transform({ id: '0', unexpected: true }, metadata)).toThrow(
      new DomainException(DomainErrorCode.INVALID_PARAMETER),
    );
  });
});
