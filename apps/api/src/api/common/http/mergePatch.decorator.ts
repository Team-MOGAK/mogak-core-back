import {
  applyDecorators,
  Injectable,
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

export const MERGE_PATCH_MEDIA_TYPE = 'application/merge-patch+json';

@Injectable()
export class MergePatchContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const contentType = http.getRequest<{ headers: Record<string, unknown> }>().headers[
      'content-type'
    ];
    const mediaType = typeof contentType === 'string' ? contentType.split(';', 1)[0]?.trim() : '';
    if (mediaType?.toLowerCase() !== MERGE_PATCH_MEDIA_TYPE) {
      http
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('Accept-Patch', MERGE_PATCH_MEDIA_TYPE);
      throw new UnsupportedMediaTypeException(`Content-Type must be ${MERGE_PATCH_MEDIA_TYPE}`);
    }
    return true;
  }
}

@Injectable()
export class MergePatchResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('Accept-Patch', MERGE_PATCH_MEDIA_TYPE);
    return next.handle();
  }
}

/** Declares a JSON Merge Patch endpoint and applies its shared HTTP contract. */
export function MergePatch(path?: string | string[]): MethodDecorator {
  return applyDecorators(
    Patch(path),
    UseGuards(MergePatchContentTypeGuard),
    UseInterceptors(MergePatchResponseInterceptor),
  );
}
