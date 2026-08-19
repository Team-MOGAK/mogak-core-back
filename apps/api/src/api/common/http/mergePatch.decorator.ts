import {
  applyDecorators,
  Injectable,
  BadRequestException,
  createParamDecorator,
  HttpStatus,
  HttpException,
  Patch,
  UnsupportedMediaTypeException,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

export const MERGE_PATCH_MEDIA_TYPE = 'application/merge-patch+json';
const PATCH_VERSION = 'mergePatchVersion';

@Injectable()
export class MergePatchContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const contentType = http.getRequest<{ headers: Record<string, unknown> }>().headers['content-type'];
    const mediaType = typeof contentType === 'string' ? contentType.split(';', 1)[0]?.trim() : '';
    if (mediaType?.toLowerCase() !== MERGE_PATCH_MEDIA_TYPE) {
      http
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('Accept-Patch', MERGE_PATCH_MEDIA_TYPE);
      throw new UnsupportedMediaTypeException(`Content-Type must be ${MERGE_PATCH_MEDIA_TYPE}`);
    }
    const ifMatch = http.getRequest<{ headers: Record<string, unknown>; [PATCH_VERSION]?: number }>()
      .headers['if-match'];
    if (ifMatch === undefined) throw new HttpException('If-Match is required', HttpStatus.PRECONDITION_REQUIRED);
    if (
      typeof ifMatch !== 'string' ||
      !/^"(?:0|[1-9]\d{0,9})"$/.test(ifMatch) ||
      Number(ifMatch.slice(1, -1)) > 2_147_483_647
    ) {
      throw new BadRequestException('If-Match must be one strong ETag');
    }
    http.getRequest<{ [PATCH_VERSION]?: number }>()[PATCH_VERSION] = Number(ifMatch.slice(1, -1));
    return true;
  }
}

@Injectable()
export class MergePatchResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader(
      'Accept-Patch',
      MERGE_PATCH_MEDIA_TYPE,
    );
    return next.handle().pipe(
      tap((body: unknown) => {
        const version =
          typeof body === 'object' && body !== null && 'result' in body
            ? (body as { result?: { version?: unknown } }).result?.version
            : undefined;
        if (typeof version === 'number') {
          context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader(
            'ETag',
            `"${version}"`,
          );
        }
      }),
    );
  }
}

export const IfMatchVersion = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number =>
    context.switchToHttp().getRequest<{ [PATCH_VERSION]: number }>()[PATCH_VERSION],
);

/** Declares a JSON Merge Patch endpoint and applies its shared HTTP contract. */
export function MergePatch(path?: string | string[]): MethodDecorator {
  return applyDecorators(
    Patch(path),
    UseGuards(MergePatchContentTypeGuard),
    UseInterceptors(MergePatchResponseInterceptor),
  );
}
