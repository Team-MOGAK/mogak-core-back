import { describe, expect, it } from 'vitest';

import { deriveOccurrenceStatus, occursOn } from './occurrence';

describe('Jogak occurrences', () => {
  it('emits an ONCE occurrence only on effectiveFrom', () => {
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

  it('emits a WEEKLY occurrence only for stored ISO weekdays inside the inclusive date range', () => {
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

  it('derives PENDING for today/future and MISSED for a past occurrence without an execution', () => {
    expect(deriveOccurrenceStatus(null, '2026-07-22', '2026-07-23')).toBe('MISSED');
    expect(deriveOccurrenceStatus(null, '2026-07-23', '2026-07-23')).toBe('PENDING');
    expect(deriveOccurrenceStatus(null, '2026-07-24', '2026-07-23')).toBe('PENDING');
    expect(deriveOccurrenceStatus('SUCCESS', '2026-07-22', '2026-07-23')).toBe('SUCCESS');
  });
});
