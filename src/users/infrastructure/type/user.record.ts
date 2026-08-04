import type { users } from '../../../database/schema';

/** Drizzle가 `users` 테이블에서 읽는 원본 행이다. 도메인 User로 변환되기 전에는 역할 값이 string이다. */
export type UserRecord = typeof users.$inferSelect;
