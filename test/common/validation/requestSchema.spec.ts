import {
  calendarDateSchema,
  positiveIdSchema,
  requiredTextSchema,
} from '../../../apps/api/src/api/common/validation/requestSchema';

describe('공통 요청 스키마', () => {
  it('경로 ID는 안전한 양의 정수로 변환한다', () => {
    expect(positiveIdSchema.parse('7')).toBe(7);
    expect(positiveIdSchema.safeParse('0').success).toBe(false);
    expect(positiveIdSchema.safeParse('9007199254740992').success).toBe(false);
  });

  it('날짜와 필수 문자열의 기존 입력 경계를 유지한다', () => {
    expect(calendarDateSchema.safeParse('2026-07-24').success).toBe(true);
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(requiredTextSchema(1, 3).safeParse('  ').success).toBe(false);
    expect(requiredTextSchema(1, 3).safeParse('모각').success).toBe(true);
  });
});
