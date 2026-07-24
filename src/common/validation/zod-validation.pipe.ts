import { createZodValidationPipe } from 'nestjs-zod';

import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';

export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: () => new AppException(AppErrorCode.INVALID_PARAMETER),
});
