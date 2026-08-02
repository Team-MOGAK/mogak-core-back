import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../application/type/authenticatedPrincipal';

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    context.switchToHttp().getRequest<{ user: AuthenticatedPrincipal }>().user,
);
