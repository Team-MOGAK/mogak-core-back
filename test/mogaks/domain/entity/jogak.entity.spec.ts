import {
  JogakExecution,
  JogakSchedule,
  MAX_JOGAKS_PER_MOGAK,
  validateJogakCapacity,
} from '../../../../src/mogaks/domain/entity/jogak.entity';

describe('조각 도메인 규칙', () => {
  it('모각에는 현재 또는 미래 일정이 있는 조각을 여덟 개까지만 둘 수 있다', () => {
    expect(validateJogakCapacity(MAX_JOGAKS_PER_MOGAK - 1)).toBe(true);
    expect(validateJogakCapacity(MAX_JOGAKS_PER_MOGAK)).toBe(false);
  });

  it('한 번 일정은 종료일과 요일을 받지 않는다', () => {
    expect(() =>
      JogakSchedule.validate({
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-23',
        effectiveTo: '2026-07-24',
        weekdays: [],
      }),
    ).toThrow('ONCE');
  });

  it('주간 일정은 요일을 하나 이상 받고 중복되거나 지원하지 않는 요일을 거부한다', () => {
    expect(() =>
      JogakSchedule.validate({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: [],
      }),
    ).toThrow('weekdays');
    expect(() =>
      JogakSchedule.validate({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: ['THURSDAY', 'THURSDAY'],
      }),
    ).toThrow('duplicate');
    expect(() =>
      JogakSchedule.validate({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-23',
        weekdays: ['SOMEDAY'],
      }),
    ).toThrow('weekday');
  });

  it('일정 발생과 실행 없는 발생 상태를 계산한다', () => {
    const schedule = JogakSchedule.validate({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
      effectiveTo: '2026-07-26',
      weekdays: ['MONDAY', 'WEDNESDAY'],
    });

    expect(JogakSchedule.occursOn(schedule, '2026-07-22')).toBe(true);
    expect(JogakSchedule.occursOn(schedule, '2026-07-21')).toBe(false);
    expect(JogakSchedule.deriveOccurrenceStatus(null, '2026-07-22', '2026-07-23')).toBe('MISSED');
    expect(JogakSchedule.deriveOccurrenceStatus(null, '2026-07-23', '2026-07-23')).toBe('PENDING');
  });

  it('실행 상태 전이와 생성 시점 제목 스냅샷을 결정한다', () => {
    expect(JogakExecution.decideTransition(null, 'IN_PROGRESS')).toEqual({ type: 'INSERT' });
    expect(JogakExecution.decideTransition('SUCCESS', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
    expect(JogakExecution.snapshot('원래 제목')).toBe('원래 제목');
  });
});
