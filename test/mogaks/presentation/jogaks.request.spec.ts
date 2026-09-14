import { dateRangeQuerySchema } from '@api/mogaks/presentation/type/jogaks.request';

describe('조각 날짜 범위 요청 스키마', () => {
  it('최대 366일 범위만 허용하고 역순 범위도 거부한다', () => {
    expect(() =>
      dateRangeQuerySchema.safeParse({ startDay: '2026-02-30', endDay: '2026-03-01' }),
    ).not.toThrow();
    expect(
      dateRangeQuerySchema.safeParse({ startDay: '2026-02-30', endDay: '2026-03-01' }).success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({ startDay: 'invalid', endDay: '2026-03-01' }).success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({ startDay: '2026-01-01', endDay: '2027-01-02' }).success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({ startDay: '2026-01-02', endDay: '2026-01-01' }).success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({ startDay: '2026-01-01', endDay: '2027-01-01' }).success,
    ).toBe(true);
    expect(
      dateRangeQuerySchema.safeParse({ startDay: '2026-01-01', endDay: '2026-12-31' }).success,
    ).toBe(true);
  });
});
