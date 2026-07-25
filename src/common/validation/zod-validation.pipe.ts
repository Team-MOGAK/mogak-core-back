import { createZodValidationPipe } from 'nestjs-zod';

import { AppErrorCode } from '../http/app-error-code';
import { DomainException } from '../http/domain.exception';

export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: () => new DomainException(AppErrorCode.INVALID_PARAMETER),
});
