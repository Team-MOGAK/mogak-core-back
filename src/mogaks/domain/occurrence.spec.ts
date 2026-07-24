import { deriveOccurrenceStatus, occursOn } from './occurrence';

describe('조각 발생 일정', () => {
  it('한 번 일정은 시작일에만 발생시킨다', () => {
    const schedule = {
      scheduleType: 'ONCE' as const,
      effectiveFrom: '2026-07-23',
      effectiveTo: null,
      weekdays: [],
    };

    expect(occursOn(schedule, '2026-07-23')).toBe(true);
    expect(occursOn(schedule, '2026-07-22')).toBe(false);
    expect(occursOn(schedule, '2026-07-24')).toBe(false);
  });

  it('주간 일정은 포함된 날짜 범위 안의 저장된 ISO 요일에만 발생시킨다', () => {
    const schedule = {
      scheduleType: 'WEEKLY' as const,
      effectiveFrom: '2026-07-20',
      effectiveTo: '2026-07-26',
      weekdays: ['MONDAY', 'WEDNESDAY'] as const,
    };

    expect(occursOn(schedule, '2026-07-20')).toBe(true);
    expect(occursOn(schedule, '2026-07-22')).toBe(true);
    expect(occursOn(schedule, '2026-07-21')).toBe(false);
    expect(occursOn(schedule, '2026-07-27')).toBe(false);
  });

  it('실행이 없으면 오늘과 미래 발생은 대기로 과거 발생은 미수행으로 계산한다', () => {
    expect(deriveOccurrenceStatus(null, '2026-07-22', '2026-07-23')).toBe('MISSED');
    expect(deriveOccurrenceStatus(null, '2026-07-23', '2026-07-23')).toBe('PENDING');
    expect(deriveOccurrenceStatus(null, '2026-07-24', '2026-07-23')).toBe('PENDING');
    expect(deriveOccurrenceStatus('SUCCESS', '2026-07-22', '2026-07-23')).toBe('SUCCESS');
  });
});
