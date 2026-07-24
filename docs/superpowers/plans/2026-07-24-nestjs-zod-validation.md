# NestJS Zod 입력 검증 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 모든 HTTP Body·Query·Path Param 검증을 Zod와 nestjs-zod로 전환하면서 기존 API와 Z005 오류 계약을 유지한다.

**Architecture:** nestjs-zod의 createZodDto와 애플리케이션 소유 createZodValidationPipe 래퍼를 전역 등록한다. 공통 스키마 헬퍼는 ID·날짜·필수 문자열·multipart JSON을 담당하고, 각 Controller는 presentation 계층에서 strict Zod DTO를 선언한다. Multer는 파일만 처리하며 게시글 request text field는 별도 JSON 어댑터가 재검증한다.

**Tech Stack:** NestJS 11, TypeScript 5.9, Zod 4, nestjs-zod 5, Jest 30, Supertest, Multer

---

## 파일 구조와 책임

| 파일 | 변경 | 책임 |
| --- | --- | --- |
| package.json, pnpm-lock.yaml | 수정 | nestjs-zod 추가, class-validator 계열 제거 |
| src/app.setup.ts | 수정 | 기본 ValidationPipe 대신 앱 소유 Zod Pipe 등록 |
| src/common/validation/zod-validation.pipe.ts | 생성 | Zod 검증 오류를 AppException(Z005)로 변환 |
| src/common/validation/request-schema.ts | 생성 | ID, 날짜, 필수 text 공통 스키마 |
| src/common/validation/multipart-json.ts | 생성 | multipart request JSON 파싱·Zod 재검증 |
| src/modules/*/presentation/*.controller.ts | 수정 | decorator DTO와 수동 ID 변환을 Zod DTO로 교체 |
| src/modules/*/presentation/*.controller.spec.ts | 수정 | 성공 계약과 Z005 입력 실패 계약 고정 |
| docs/migration/2026-07-23-nestjs-migration-handoff.md | 수정 | 실제 검증 구현 상태 기록 |

## 전환 불변조건

- Body·Query·Path Param은 createZodDto 타입을 사용하고 객체 스키마는 모두 strict다.
- JSON Body는 현재 class-transformer의 @Type(() => Number)가 있던 값만 명시적으로 coerce한다. 나머지 JSON number·boolean은 올바른 JSON 타입이어야 한다.
- Query·Path Param의 ID·페이지 숫자는 명시적으로 coerce하고, 양의 safe integer를 검사한다.
- scheduleType, provider, scheduledDate처럼 Application Service가 전용 오류를 결정하는 값은 Zod가 enum으로 선점하지 않는다.
- Header, UploadedFile(s), Response는 DTO 대상이 아니다. 그러므로 global pipe의 strictSchemaDeclaration은 기본값 false로 둔다.
- API URL, method, 성공 응답, Z005/Z006과 도메인 오류 코드는 바꾸지 않는다.

### Task 1: nestjs-zod와 앱 소유 Validation Pipe를 추가한다

**Files:**
- Modify: package.json
- Modify: pnpm-lock.yaml
- Create: src/common/validation/zod-validation.pipe.ts
- Create: src/common/validation/zod-validation.pipe.spec.ts
- Modify: src/app.setup.ts
- Test: src/app.setup.spec.ts

- [ ] **Step 1: 의존성을 추가한다.**

Run: \`pnpm add nestjs-zod@^5.4.0\`

Expected: package.json dependencies와 pnpm-lock.yaml에 nestjs-zod가 추가된다.

- [ ] **Step 2: Zod error가 현재 예외 코드로 바뀌는 실패 테스트를 작성한다.**

Create src/common/validation/zod-validation.pipe.spec.ts:

~~~
import { type ArgumentMetadata } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';
import { AppZodValidationPipe } from './zod-validation.pipe';

class PositiveIdDto extends createZodDto(
  z.object({ id: z.coerce.number().int().positive().refine(Number.isSafeInteger) }).strict(),
) {}

describe('앱 Zod 검증 Pipe', () => {
  const metadata: ArgumentMetadata = { type: 'body', metatype: PositiveIdDto };

  it('양의 정수 문자열을 number로 변환한다', async () => {
    await expect(new AppZodValidationPipe().transform({ id: '7' }, metadata)).resolves.toEqual({ id: 7 });
  });

  it('잘못된 값과 정의되지 않은 필드를 Z005로 변환한다', async () => {
    await expect(
      new AppZodValidationPipe().transform({ id: '0', unexpected: true }, metadata),
    ).rejects.toEqual(new AppException(AppErrorCode.INVALID_PARAMETER));
  });
});
~~~

- [ ] **Step 3: Pipe 모듈 부재로 테스트가 실패하는지 확인한다.**

Run: \`pnpm test --runInBand src/common/validation/zod-validation.pipe.spec.ts\`

Expected: FAIL — zod-validation.pipe 모듈을 찾지 못한다.

- [ ] **Step 4: custom validation factory와 전역 등록을 구현한다.**

Create src/common/validation/zod-validation.pipe.ts:

~~~
import { createZodValidationPipe } from 'nestjs-zod';

import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';

export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: () => new AppException(AppErrorCode.INVALID_PARAMETER),
});
~~~

Modify src/app.setup.ts. ValidationPipe, AppErrorCode, AppException import와 app.useGlobalPipes(new ValidationPipe(...)) 블록을 제거하고 다음 import와 호출을 사용한다.

~~~
import type { INestApplication } from '@nestjs/common';

import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { AppZodValidationPipe } from './common/validation/zod-validation.pipe';

// 기존 CORS 설정을 유지한다.
app.useGlobalPipes(new AppZodValidationPipe());
app.useGlobalFilters(new AllExceptionsFilter());
~~~

- [ ] **Step 5: Pipe와 app setup 테스트를 통과시킨다.**

Run: \`pnpm test --runInBand src/common/validation/zod-validation.pipe.spec.ts src/app.setup.spec.ts\`

Expected: PASS — Zod parsing error는 Z005이고 CORS·global exception filter 동작은 유지된다.

- [ ] **Step 6: 기반 변경을 커밋한다.**

~~~
git add package.json pnpm-lock.yaml src/app.setup.ts src/common/validation/zod-validation.pipe.ts src/common/validation/zod-validation.pipe.spec.ts src/app.setup.spec.ts
git commit -m "feat(validation): add Zod request pipe"
~~~

### Task 2: 공통 스키마와 multipart JSON 어댑터를 만든다

**Files:**
- Create: src/common/validation/request-schema.ts
- Create: src/common/validation/multipart-json.ts
- Create: src/common/validation/multipart-json.spec.ts

- [ ] **Step 1: multipart JSON 실패 사례를 먼저 작성한다.**

Create src/common/validation/multipart-json.spec.ts:

~~~
import { z } from 'zod';

import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';
import { parseMultipartJson } from './multipart-json';

const postSchema = z.object({
  targetDate: z.iso.date(),
  contents: z.string().min(1).max(350).regex(/\S/),
}).strict();

describe('multipart JSON 어댑터', () => {
  it('일반 JSON과 request 문자열을 같은 검증 결과로 반환한다', () => {
    expect(parseMultipartJson({ targetDate: '2026-07-24', contents: '회고' }, postSchema)).toEqual({
      targetDate: '2026-07-24', contents: '회고',
    });
    expect(parseMultipartJson(
      { request: JSON.stringify({ targetDate: '2026-07-24', contents: '회고' }) }, postSchema,
    )).toEqual({ targetDate: '2026-07-24', contents: '회고' });
  });

  it('손상 JSON과 정의되지 않은 필드를 Z005로 거부한다', () => {
    expect(() => parseMultipartJson({ request: '{' }, postSchema)).toThrow(
      new AppException(AppErrorCode.INVALID_PARAMETER),
    );
    expect(() => parseMultipartJson(
      { request: JSON.stringify({ targetDate: '2026-07-24', contents: '회고', extra: true }) }, postSchema,
    )).toThrow(new AppException(AppErrorCode.INVALID_PARAMETER));
  });
});
~~~

- [ ] **Step 2: 새 테스트가 구현 부재로 실패하는지 확인한다.**

Run: \`pnpm test --runInBand src/common/validation/multipart-json.spec.ts\`

Expected: FAIL — multipart-json 모듈을 찾지 못한다.

- [ ] **Step 3: 공통 스키마와 JSON 어댑터를 구현한다.**

Create src/common/validation/request-schema.ts:

~~~
import { z } from 'zod';

export const positiveIdSchema = z.coerce.number().int().positive().refine(Number.isSafeInteger);
export const calendarDateSchema = z.iso.date();
export const requiredTextSchema = (minimum: number, maximum: number) =>
  z.string().min(minimum).max(maximum).regex(/\S/);
~~~

Create src/common/validation/multipart-json.ts:

~~~
import { z } from 'zod';

import { AppErrorCode } from '../http/app-error-code';
import { AppException } from '../http/app.exception';

export function parseMultipartJson<TSchema extends z.ZodType>(
  body: unknown,
  schema: TSchema,
): z.output<TSchema> {
  const input = isMultipartBody(body) ? parseJson(body.request) : body;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppException(AppErrorCode.INVALID_PARAMETER);
  return parsed.data;
}

function isMultipartBody(value: unknown): value is Readonly<{ request: string }> {
  return typeof value === 'object' && value !== null && 'request' in value && typeof value.request === 'string';
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
}
~~~

- [ ] **Step 4: multipart adapter 테스트를 통과시킨다.**

Run: \`pnpm test --runInBand src/common/validation/multipart-json.spec.ts\`

Expected: PASS — direct JSON·multipart JSON은 같은 typed result를 반환하고 parsing/schema failure는 Z005다.

- [ ] **Step 5: 공통 검증 계층을 커밋한다.**

~~~
git add src/common/validation/request-schema.ts src/common/validation/multipart-json.ts src/common/validation/multipart-json.spec.ts
git commit -m "feat(validation): add request schema helpers"
~~~

### Task 3: Auth와 Users의 Body·Path Param을 Zod DTO로 전환한다

**Files:**
- Modify: src/modules/auth/presentation/auth.controller.ts
- Modify: src/modules/auth/presentation/auth.controller.spec.ts
- Modify: src/modules/users/presentation/user.controller.ts
- Modify: src/modules/users/presentation/consent.controller.ts
- Modify: src/modules/users/presentation/users.controller.spec.ts

- [ ] **Step 1: Auth·Users의 strict input failure를 HTTP test에 추가한다.**

~~~
it('정의되지 않은 인증 필드와 잘못된 사용자 consent 타입을 Z005로 거부한다', async () => {
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ id_token: '', unexpected: true })
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
  await request(app.getHttpServer())
    .post('/api/users/join')
    .send({
      nickname: '모각러', job: '개발', address: '서울',
      consents: [{ consentItemId: '1', agreed: true }],
    })
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
});
~~~

- [ ] **Step 2: 새 failure test를 실행해 현재 DTO 전환 필요성을 확인한다.**

Run: \`pnpm test --runInBand src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts\`

Expected: FAIL 또는 기존 class-validator 경계만 실행된다.

- [ ] **Step 3: Auth Controller를 createZodDto로 바꾼다.**

Remove class-validator imports and classes. Add:

~~~
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

class AppleLoginRequest extends createZodDto(z.object({ id_token: z.string().min(1) }).strict()) {}
class SocialLoginRequest extends createZodDto(z.object({ token: z.string().min(1) }).strict()) {}
class ProviderParam extends createZodDto(z.object({ provider: z.string().min(1) }).strict()) {}
~~~

Use the whole Param DTO so provider-specific domain behavior remains in parseSocialProvider:

~~~
async loginSocial(@Param() params: ProviderParam, @Body() request: SocialLoginRequest) {
  return successResponse(await this.authService.login(parseSocialProvider(params.provider), request.token));
}
~~~

- [ ] **Step 4: User와 Consent Controller를 createZodDto로 바꾼다.**

Remove class-transformer/class-validator imports and classes. Use these schemas in the respective controller files:

~~~
const consentAgreementSchema = z.object({
  consentItemId: z.number().int().positive(),
  agreed: z.boolean(),
}).strict();

class NicknameRequest extends createZodDto(
  z.object({ nickname: requiredTextSchema(2, 10) }).strict(),
) {}
class JobRequest extends createZodDto(
  z.object({ job: requiredTextSchema(1, 100) }).strict(),
) {}
class JoinRequest extends createZodDto(z.object({
  nickname: requiredTextSchema(2, 10),
  job: requiredTextSchema(1, 100),
  address: requiredTextSchema(1, 100),
  consents: z.array(consentAgreementSchema).optional(),
}).strict()) {}
class UserConsentUpdateRequest extends createZodDto(
  z.object({ consents: z.array(consentAgreementSchema).optional() }).strict(),
) {}
class MarketingConsentPatchRequest extends createZodDto(
  z.object({ marketingAgreed: z.boolean().optional(), advertisementAgreed: z.boolean().optional() })
    .strict()
    .refine((value) => value.marketingAgreed !== undefined || value.advertisementAgreed !== undefined),
) {}
~~~

Keep optional spreading when calling ConsentService. Remove only the redundant empty marketing body if block because the schema now returns the same Z005.

- [ ] **Step 5: Auth·Users HTTP test를 통과시키고 커밋한다.**

Run: \`pnpm test --runInBand src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/presentation/users.controller.spec.ts\`

Expected: PASS — existing success, refresh header, rate limit, profile multipart and Z005 envelope remain intact.

~~~
git add src/modules/auth/presentation/auth.controller.ts src/modules/auth/presentation/auth.controller.spec.ts src/modules/users/presentation/user.controller.ts src/modules/users/presentation/consent.controller.ts src/modules/users/presentation/users.controller.spec.ts
git commit -m "refactor(users): migrate request validation to Zod"
~~~

### Task 4: Modarat·Mogak·Jogak Body·Query·Param을 Zod DTO로 전환한다

**Files:**
- Modify: src/modules/mogaks/presentation/modarats-mogaks.controller.ts
- Modify: src/modules/mogaks/presentation/jogaks.controller.ts
- Modify: src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts
- Modify: src/modules/mogaks/presentation/jogaks.controller.spec.ts

- [ ] **Step 1: unknown field, malformed ID, malformed Query test를 추가한다.**

~~~
it('모각 Body의 unknown field와 조각 Path ID를 Z005로 거부한다', async () => {
  await request(app.getHttpServer())
    .post('/api/mogaks')
    .send({ modaratId: 3, title: '정보처리기사', unexpected: true })
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
  await request(app.getHttpServer())
    .get('/api/jogaks/not-a-number')
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
});
~~~

- [ ] **Step 2: 새 test가 현재 수동 asSafeId/class-validator 경계에 의존하는지 확인한다.**

Run: \`pnpm test --runInBand src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts src/modules/mogaks/presentation/jogaks.controller.spec.ts\`

Expected: FAIL 또는 기존 implementation에만 의존한다.

- [ ] **Step 3: Modarat·Mogak Zod DTO와 전체 Param DTO를 구현한다.**

Add these imports to src/modules/mogaks/presentation/modarats-mogaks.controller.ts:

~~~
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { positiveIdSchema, requiredTextSchema } from '../../../common/validation/request-schema';
~~~

~~~
class ModaratRequest extends createZodDto(z.object({
  title: requiredTextSchema(1, 100),
  color: requiredTextSchema(1, 100),
}).strict()) {}
class MogakRequest extends createZodDto(z.object({
  modaratId: positiveIdSchema,
  title: requiredTextSchema(1, 100),
  categoryCode: z.string().min(1).max(100).optional(),
  customCategoryName: z.string().min(1).max(200).optional(),
  color: z.string().min(4).max(10).optional(),
}).strict()) {}
class MogakUpdateRequest extends createZodDto(z.object({
  title: requiredTextSchema(1, 100),
  categoryCode: z.string().min(1).max(100).optional(),
  customCategoryName: z.string().min(1).max(200).optional(),
  color: z.string().min(4).max(10).optional(),
}).strict()) {}
class ModaratIdParam extends createZodDto(z.object({ modaratId: positiveIdSchema }).strict()) {}
class MogakIdParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}
~~~

Replace each @Param('...') string with @Param() DTO and pass params.modaratId/params.mogakId. Remove asSafeId.

- [ ] **Step 4: Jogak Zod DTO와 복합 execution Param DTO를 구현한다.**

Add these imports to src/modules/mogaks/presentation/jogaks.controller.ts:

~~~
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../../common/validation/request-schema';
~~~

~~~
const scheduleSchema = z.object({
  scheduleType: z.string().min(1),
  effectiveFrom: calendarDateSchema,
  effectiveTo: calendarDateSchema.optional(),
  weekdays: z.array(z.string()).optional(),
}).strict();

class CreateJogakRequest extends createZodDto(z.object({
  mogakId: positiveIdSchema,
  title: requiredTextSchema(1, 100),
  schedule: scheduleSchema.optional(),
  isRoutine: z.boolean().optional(),
  days: z.array(z.string()).optional(),
  today: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
}).strict()) {}
class UpdateJogakRequest extends createZodDto(z.object({
  title: requiredTextSchema(1, 100),
  schedule: scheduleSchema.optional(),
}).strict()) {}
class DateQuery extends createZodDto(z.object({ date: calendarDateSchema }).strict()) {}
class DateRangeQuery extends createZodDto(z.object({
  startDay: calendarDateSchema, endDay: calendarDateSchema,
}).strict()) {}
class JogakIdParam extends createZodDto(z.object({ jogakId: positiveIdSchema }).strict()) {}
class MogakJogakParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}
class ExecutionParam extends createZodDto(z.object({
  jogakId: positiveIdSchema, scheduledDate: z.string().min(1),
}).strict()) {}
~~~

Use @Param() params: ExecutionParam in start/success/fail and call this.command(user, params.jogakId, params.scheduledDate, ...). Keep asScheduleType, scheduleFor and explicitScheduleFor so J009/J017 domain behavior remains owned by current application code.

- [ ] **Step 5: Mogaks HTTP test를 통과시키고 커밋한다.**

Run: \`pnpm test --runInBand src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts src/modules/mogaks/presentation/jogaks.controller.spec.ts\`

Expected: PASS — creation, legacy schedule shape, virtual execution, update and delete responses are unchanged; input format errors yield Z005.

~~~
git add src/modules/mogaks/presentation/modarats-mogaks.controller.ts src/modules/mogaks/presentation/jogaks.controller.ts src/modules/mogaks/presentation/modarats-mogaks.controller.spec.ts src/modules/mogaks/presentation/jogaks.controller.spec.ts
git commit -m "refactor(mogaks): migrate request validation to Zod"
~~~

### Task 5: Posts의 JSON·multipart Body와 Query·Param을 Zod로 전환한다

**Files:**
- Modify: src/modules/posts/presentation/posts.controller.ts
- Modify: src/modules/posts/presentation/posts.controller.spec.ts

- [ ] **Step 1: direct JSON unknown field와 malformed multipart request test를 추가한다.**

~~~
it('게시글 JSON과 multipart request의 잘못된 입력을 Z005로 거부한다', async () => {
  await request(app.getHttpServer())
    .post('/api/jogaks/11/posts')
    .send({ targetDate: '2026-07-23', contents: '회고', unexpected: true })
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
  await request(app.getHttpServer())
    .post('/api/jogaks/11/posts')
    .field('request', '{')
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
  expect(posts.createPost).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 2: 새 test가 class-transformer based createPostRequest에만 의존하는지 확인한다.**

Run: \`pnpm test --runInBand src/modules/posts/presentation/posts.controller.spec.ts\`

Expected: FAIL — Zod transport DTO와 adapter가 아직 없다.

- [ ] **Step 3: Posts DTO와 multipart transport union을 구현한다.**

Add these imports to src/modules/posts/presentation/posts.controller.ts:

~~~
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { parseMultipartJson } from '../../../common/validation/multipart-json';
import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../../common/validation/request-schema';
~~~

~~~
const createPostSchema = z.object({
  targetDate: calendarDateSchema,
  contents: requiredTextSchema(1, 350),
}).strict();
const createPostTransportSchema = z.union([
  createPostSchema,
  z.object({ request: z.string() }).strict(),
]);

class CreatePostTransportRequest extends createZodDto(createPostTransportSchema) {}
class UpdatePostRequest extends createZodDto(
  z.object({ contents: requiredTextSchema(1, 350) }).strict(),
) {}
class CommentRequest extends createZodDto(
  z.object({ contents: requiredTextSchema(1, 200) }).strict(),
) {}
class LikePostRequest extends createZodDto(z.object({ postId: positiveIdSchema }).strict()) {}
class PostDateQuery extends createZodDto(z.object({ targetDate: calendarDateSchema }).strict()) {}
class PostPageQuery extends createZodDto(z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: positiveIdSchema,
}).strict()) {}
class JogakIdParam extends createZodDto(z.object({ jogakId: positiveIdSchema }).strict()) {}
class MogakIdParam extends createZodDto(z.object({ mogakId: positiveIdSchema }).strict()) {}
class PostIdParam extends createZodDto(z.object({ postId: positiveIdSchema }).strict()) {}
class PostCommentParam extends createZodDto(z.object({
  postId: positiveIdSchema, commentId: positiveIdSchema,
}).strict()) {}
~~~

- [ ] **Step 4: createPost와 모든 numeric Param을 DTO output으로 교체한다.**

~~~
async createPost(
  @CurrentUser() user: AuthenticatedUser,
  @Param() params: JogakIdParam,
  @Body() body: CreatePostTransportRequest,
  @UploadedFiles() files: Express.Multer.File[] | undefined,
) {
  const request = parseMultipartJson(body, createPostSchema);
  const uploadedFiles = (files ?? []).filter((file) => file.size > 0);
  if (uploadedFiles.length > 0) await this.storage.uploadPostImages(uploadedFiles);
  return successResponse(await this.posts.createPost(user.userId, {
    jogakId: params.jogakId,
    targetDate: request.targetDate,
    contents: request.contents,
  }));
}
~~~

Retain FilesInterceptor and the existing Storage boundary. Replace every remaining @Param('id') string with a whole Param DTO; remove createPostRequest, isRecord and asSafeId.

- [ ] **Step 5: Posts contract test를 통과시키고 커밋한다.**

Run: \`pnpm test --runInBand src/modules/posts/presentation/posts.controller.spec.ts\`

Expected: PASS — JSON/multipart creation, image limits, Storage Z006, page default, comment/like contracts are unchanged; malformed request is Z005.

~~~
git add src/modules/posts/presentation/posts.controller.ts src/modules/posts/presentation/posts.controller.spec.ts
git commit -m "refactor(posts): validate multipart requests with Zod"
~~~

### Task 6: Social Query·Path Param을 전환하고 class-validator 의존성을 제거한다

**Files:**
- Modify: src/modules/social/presentation/social.controller.ts
- Modify: src/modules/social/presentation/social.controller.spec.ts
- Modify: package.json
- Modify: pnpm-lock.yaml

- [ ] **Step 1: 소셜의 invalid Query contract test를 추가한다.**

~~~
it('소셜 목록 Query의 잘못된 숫자를 Z005로 거부한다', async () => {
  await request(app.getHttpServer())
    .get('/api/posts?size=0')
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
  await request(app.getHttpServer())
    .get('/api/posts/pacemakers?cursor=not-a-number&size=10')
    .expect(400)
    .expect(({ body }) => expect(body.code).toBe('Z005'));
});
~~~

- [ ] **Step 2: Social DTO를 Zod로 바꾼다.**

Add these imports to src/modules/social/presentation/social.controller.ts:

~~~
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
~~~

~~~
class NicknameParam extends createZodDto(z.object({ nickname: z.string().min(1) }).strict()) {}
class PageQuery extends createZodDto(z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().positive().refine(Number.isSafeInteger),
}).strict()) {}
class PacemakerQuery extends createZodDto(z.object({
  cursor: z.coerce.number().int().min(0),
  size: z.coerce.number().int().positive().refine(Number.isSafeInteger),
}).strict()) {}
class NetworkQuery extends createZodDto(z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().positive().refine(Number.isSafeInteger),
  sort: z.enum(['createdAt', 'likeCnt']).default('createdAt'),
  address: z.string().optional(),
}).strict()) {}
~~~

Replace each nickname route with @Param() params: NicknameParam and pass params.nickname. Retain current service call order.

- [ ] **Step 3: 소셜 test와 class-validator 제거 전 참조 검사를 실행한다.**

Run: \`pnpm test --runInBand src/modules/social/presentation/social.controller.spec.ts\`

Expected: PASS.

Run: \`rg -n "from 'class-validator'|from 'class-transformer'|new ValidationPipe|plainToInstance|validateSync" src test package.json\`

Expected: no output after all controller imports are migrated.

- [ ] **Step 4: 더 이상 참조되지 않는 runtime dependency를 제거한다.**

Run: \`pnpm remove class-validator class-transformer\`

Expected: package.json과 lockfile에서 두 dependency가 제거된다.

- [ ] **Step 5: 소셜 전환과 dependency cleanup을 커밋한다.**

~~~
git add src/modules/social/presentation/social.controller.ts src/modules/social/presentation/social.controller.spec.ts package.json pnpm-lock.yaml
git commit -m "refactor(social): migrate request validation to Zod"
~~~

### Task 7: 문서를 구현에 맞추고 전체 회귀를 통과시킨다

**Files:**
- Modify: docs/migration/2026-07-23-nestjs-migration-handoff.md
- Modify: docs/superpowers/specs/2026-07-24-nestjs-zod-validation-design.md

- [ ] **Step 1: 인수인계 문서와 설계 상태를 갱신한다.**

Add this bullet under 구현된 기반 in docs/migration/2026-07-23-nestjs-migration-handoff.md:

~~~
- nestjs-zod와 앱 소유 Zod validation Pipe로 Body·Query·Path Param을 strict 검증하며, 모든 입력 오류는 기존 Z005 envelope로 반환
~~~

Change the Zod design spec status to:

~~~
상태: 구현 완료 · 전체 검증 통과 전
~~~

- [ ] **Step 2: 포맷·lint·typecheck·build를 실행한다.**

Run: \`pnpm format:check && pnpm lint && pnpm typecheck && pnpm build\`

Expected: all commands exit 0. If formatting fails, run \`pnpm format\`, then repeat the exact check command.

- [ ] **Step 3: 전체 Jest, e2e, PostgreSQL integration test를 실행한다.**

Run: \`pnpm test --runInBand && pnpm test:e2e --runInBand && pnpm test:db --runInBand\`

Expected: every suite passes.

- [ ] **Step 4: 이전 validation stack이 사라졌는지 확인한다.**

Run:

~~~
if rg -n "from 'class-validator'|from 'class-transformer'|new ValidationPipe|plainToInstance|validateSync" src test package.json; then exit 1; fi
git diff --check
git status --short
~~~

Expected: first command has no matches, diff check is clean, and status contains only intended migration changes.

- [ ] **Step 5: 문서와 검증 결과를 커밋한다.**

~~~
git add docs/migration/2026-07-23-nestjs-migration-handoff.md docs/superpowers/specs/2026-07-24-nestjs-zod-validation-design.md
git commit -m "docs: record Zod validation migration"
~~~

## 완료 확인

- 모든 Controller Body·Query·Path Param이 createZodDto 타입을 사용한다.
- class-validator, class-transformer, Nest 기본 ValidationPipe, plainToInstance, validateSync가 source와 dependency에서 사라진다.
- unknown field, 숫자/날짜/ID/page 오류와 multipart JSON 오류는 Z005 envelope를 반환한다.
- 파일 upload 제한과 Storage 비활성 Z006은 바뀌지 않는다.
- 성공 응답, 인증·rate limit·도메인 오류는 기존 HTTP contract test에서 유지된다.
