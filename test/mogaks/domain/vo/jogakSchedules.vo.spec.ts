import { JogakSchedules } from '@core/mogaks/domain/vo/jogakSchedules.vo';
import { JogakWeekdays } from '@core/mogaks/domain/vo/jogakWeekdays.vo';
import { OnceSchedule } from '@core/mogaks/domain/vo/onceSchedule.vo';
import { RoutineSchedule } from '@core/mogaks/domain/vo/routineSchedule.vo';

describe('Jogak 일정 일급 컬렉션', () => {
  it('요일 입력과 반환 배열을 방어적으로 복사한다', () => {
    const input = ['MONDAY', 'WEDNESDAY'];
    const weekdays = JogakWeekdays.create(input);
    input.push('FRIDAY');
    const output = weekdays.toArray();
    output.pop();

    expect(weekdays.toArray()).toEqual(['MONDAY', 'WEDNESDAY']);
  });

  it('비어 있거나 중복되거나 지원하지 않는 요일을 거부한다', () => {
    expect(() => JogakWeekdays.create([])).toThrow('weekdays are required');
    expect(() => JogakWeekdays.create(['MONDAY', 'MONDAY'])).toThrow('duplicate weekday');
    expect(() => JogakWeekdays.create(['HOLIDAY'])).toThrow('unsupported weekday');
  });

  it('한 번 일정은 정확히 그 날짜에만 발생하고 루틴은 기간과 요일에 따라 발생한다', () => {
    const once = OnceSchedule.create('2026-07-23');
    const routine = RoutineSchedule.create(
      '2026-07-20',
      '2026-07-31',
      JogakWeekdays.create(['THURSDAY']),
    );

    expect(once.occursOn('2026-07-23')).toBe(true);
    expect(once.occursOn('2026-07-24')).toBe(false);
    expect(routine.occursOn('2026-07-23')).toBe(true);
    expect(routine.occursOn('2026-08-06')).toBe(false);
  });

  it('활성 루틴을 과거 Once보다 대표로 고르고, 현재·후속 선택은 정렬 순서를 따른다', () => {
    const pastOnce = OnceSchedule.create('2026-07-01');
    const routine = RoutineSchedule.create('2026-07-20', null, JogakWeekdays.create(['THURSDAY']));
    const successor = OnceSchedule.create('2026-08-01');
    const schedules = JogakSchedules.create([pastOnce, routine, successor]);

    expect(schedules.representativeOn('2026-07-23')).toBe(routine);
    expect(schedules.currentOn('2026-07-23')).toBe(routine);
    expect(schedules.successorOf(routine)).toBe(successor);
    expect(schedules.toArray()).toEqual([pastOnce, routine, successor]);
  });

  it('오늘 발생하는 Once는 미래 이력보다 대표로 우선한다', () => {
    const todayOnce = OnceSchedule.create('2026-07-23');
    const futureOnce = OnceSchedule.create('2026-08-01');
    const schedules = JogakSchedules.create([todayOnce, futureOnce]);

    expect(schedules.representativeOn('2026-07-23')).toBe(todayOnce);
  });
});
