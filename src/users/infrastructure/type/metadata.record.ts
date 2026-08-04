import type { addresses, jobs } from '../../../database/schema';

/** Drizzle가 사용자 메타데이터 lookup 테이블에서 읽는 원본 행 타입. */
export type MetadataRecord = typeof jobs.$inferSelect | typeof addresses.$inferSelect;
