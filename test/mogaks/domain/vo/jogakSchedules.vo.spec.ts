import {
  createJogakSchedule,
  currentScheduleIndexOn,
  occursOn,
  representativeScheduleIndexOn,
  successorScheduleIndexOf,
} from '@core/mogaks/domain/policy/jogakSchedule.policy';

describe('Jogak 일정 규칙', () => {
  it('요일 입력과 반환 배열을 방어적으로 복사한다', () => {
    const input = ['MONDAY', 'WEDNESDAY'];
    const schedule = createJogakSchedule({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
      weekdays: input,
    });
    input.push('FRIDAY');
    const output = [...schedule.weekdays];
    output.pop();

    expect(schedule.weekdays).toEqual(['MONDAY', 'WEDNESDAY']);
  });

  it('비어 있거나 중복되거나 지원하지 않는 요일을 거부한다', () => {
    expect(() =>
      createJogakSchedule({ scheduleType: 'WEEKLY', effectiveFrom: '2026-07-20', weekdays: [] }),
    ).toThrow('weekdays are required');
    expect(() =>
      createJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        weekdays: ['MONDAY', 'MONDAY'],
      }),
    ).toThrow('duplicate weekday');
    expect(() =>
      createJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        weekdays: ['HOLIDAY'],
      }),
    ).toThrow('unsupported weekday');
  });

  it('한 번 일정은 정확히 그 날짜에만 발생하고 루틴은 기간과 요일에 따라 발생한다', () => {
    const once = createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-07-23' });
    const routine = createJogakSchedule({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
      effectiveTo: '2026-07-31',
      weekdays: ['THURSDAY'],
    });

    expect(once).toEqual({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-23',
      effectiveTo: null,
      weekdays: [],
    });
    expect(occursOn(once, '2026-07-23')).toBe(true);
    expect(occursOn(once, '2026-07-24')).toBe(false);
    expect(occursOn(routine, '2026-07-23')).toBe(true);
    expect(occursOn(routine, '2026-08-06')).toBe(false);
  });

  it('활성 루틴을 과거 Once보다 대표로 고르고, 현재·후속 선택은 정렬 순서를 따른다', () => {
    const schedules = [
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-07-01' }),
      createJogakSchedule({
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-07-20',
        weekdays: ['THURSDAY'],
      }),
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-08-01' }),
    ];

    expect(representativeScheduleIndexOn(schedules, '2026-07-23')).toBe(1);
    expect(currentScheduleIndexOn(schedules, '2026-07-23')).toBe(1);
    expect(successorScheduleIndexOf(schedules, 1)).toBe(2);
  });

  it('같은 시작일의 현재 일정은 정렬된 이력의 마지막 항목을 선택한다', () => {
    const schedules = [
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-07-23' }),
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-07-23' }),
    ];

    // service가 effectiveFrom ASC, scheduleId ASC로 정렬한 이력에서는 뒤 항목이 더 큰 scheduleId다.
    expect(currentScheduleIndexOn(schedules, '2026-07-23')).toBe(1);
    expect(representativeScheduleIndexOn(schedules, '2026-07-23')).toBe(1);
  });

  it('오늘 발생하는 Once는 미래 이력보다 대표로 우선한다', () => {
    const schedules = [
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-07-23' }),
      createJogakSchedule({ scheduleType: 'ONCE', effectiveFrom: '2026-08-01' }),
    ];

    expect(representativeScheduleIndexOn(schedules, '2026-07-23')).toBe(0);
  });
});
