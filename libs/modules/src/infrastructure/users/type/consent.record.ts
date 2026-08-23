import type { consentItems, userConsents } from '../../database/schema';

/** Drizzle가 동의 테이블에서 읽는 원본 행 타입. */
export type ConsentItemRecord = typeof consentItems.$inferSelect;
export type UserConsentRecord = typeof userConsents.$inferSelect;
