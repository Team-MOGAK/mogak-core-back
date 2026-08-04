import {
  decideJogakExecutionTransition,
  snapshotJogakTitle,
} from '../../../../src/mogaks/domain/policy/jogakExecution.policy';
import {
  MAX_JOGAKS_PER_MOGAK,
  validateJogakCapacity,
} from '../../../../src/mogaks/domain/policy/jogak.policy';
import {
  deriveOccurrenceStatus,
  occursOn,
  validateJogakSchedule,
} from '../../../../src/mogaks/domain/policy/jogakSchedule.policy';

describe('조각 도메인 규칙', () => {
  it('모각에는 현재 또는 미래 일정이 있는 조각을 여덟 개까지만 둘 수 있다', () => {
    expect(validateJogakCapacity(MAX_JOGAKS_PER_MOGAK - 1)).toBe(true);
    expect(validateJogakCapacity(MAX_JOGAKS_PER_MOGAK)).toBe(false);
  });

  it('한 번 일정은 종료일과 요일을 받지 않는다', () => {
    expect(() =>
      validateJogakSchedule({
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: '2026-07-24',
        weekdays: [],
      }),
    ).toThrow('ONCE');
  });

  it('주간 일정은 요일을 하나 이상 받고 중복되거나 지원하지 않는 요일을 거부한다', () => {
    expect(() =>
      validateJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: [],
      }),
    ).toThrow('weekdays');
    expect(() =>
      validateJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: ['THURSDAY', 'THURSDAY'],
      }),
    ).toThrow('duplicate');
    expect(() =>
      validateJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: ['SOMEDAY'],
      }),
    ).toThrow('weekday');
  });

  it('일정 발생과 실행 없는 발생 상태를 계산한다', () => {
    const schedule = validateJogakSchedule({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
      effectiveTo: '2026-07-26',
      weekdays: ['MONDAY', 'WEDNESDAY'],
    });

    expect(occursOn(schedule, '2026-07-22')).toBe(true);
    expect(occursOn(schedule, '2026-07-21')).toBe(false);
    expect(deriveOccurrenceStatus(null, '2026-07-22', '2026-07-23')).toBe('MISSED');
    expect(deriveOccurrenceStatus(null, '2026-07-23', '2026-07-23')).toBe('PENDING');
  });

  it('한 번 일정은 시작일 다음 날에 발생하지 않는다', () => {
    const schedule = validateJogakSchedule({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-23',
    });

    expect(occursOn(schedule, '2026-07-24')).toBe(false);
  });

  it('실행 상태 전이와 생성 시점 제목 스냅샷을 결정한다', () => {
    expect(decideJogakExecutionTransition(null, 'IN_PROGRESS')).toEqual({ type: 'INSERT' });
    expect(decideJogakExecutionTransition('SUCCESS', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
    expect(snapshotJogakTitle('원래 제목')).toBe('원래 제목');
  });
});
