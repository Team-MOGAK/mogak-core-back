import { JogakExecutionStatus } from '../../../../apps/api/src/core/mogaks/domain/vo/jogakExecution.vo';
import {
  JogakScheduleType,
  JogakScheduleWeekdayName,
} from '../../../../apps/api/src/core/mogaks/domain/vo/jogakSchedule.vo';

describe('조각 영속 값 VO', () => {
  it('저장된 실행 상태를 도메인 상태로 해석한다', () => {
    expect(JogakExecutionStatus.parse('SUCCESS')).toBe('SUCCESS');
    expect(() => JogakExecutionStatus.parse('CANCELLED')).toThrow(RangeError);
  });

  it('저장된 일정 종류와 요일을 도메인 값으로 해석한다', () => {
    expect(JogakScheduleType.parse('WEEKLY')).toBe('WEEKLY');
    expect(JogakScheduleWeekdayName.parse('MONDAY')).toBe('MONDAY');
    expect(() => JogakScheduleType.parse('DAILY')).toThrow(RangeError);
    expect(() => JogakScheduleWeekdayName.parse('HOLIDAY')).toThrow(RangeError);
  });
});
