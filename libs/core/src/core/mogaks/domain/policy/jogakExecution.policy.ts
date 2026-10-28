import type { JogakExecutionTransition, JogakExecutionStatus } from '../vo/jogakExecution.vo';
import { compareDateOnly, dateRangeDays, isDateOnly } from '../vo/jogakScheduleDate.vo';

/** 일정 없는 날 `start`로 실행을 만들 수 있는 기간: KST 오늘부터 이 일수만큼(오늘 포함). */
export const AD_HOC_START_WINDOW_DAYS = 7;

export function isAdHocStartDate(scheduledDate: string, today: string): boolean {
  if (!isDateOnly(scheduledDate) || !isDateOnly(today)) return false;
  return (
    compareDateOnly(scheduledDate, today) >= 0 &&
    dateRangeDays(today, scheduledDate) <= AD_HOC_START_WINDOW_DAYS
  );
}

export function decideJogakExecutionTransition(
  current: JogakExecutionStatus | null,
  desired: JogakExecutionStatus,
): JogakExecutionTransition {
  if (current === null) return { type: 'INSERT' };
  if (current === desired) return { type: 'NOOP' };
  if (desired === 'IN_PROGRESS') return { type: 'REJECT' };
  return { type: 'UPDATE' };
}

export function snapshotJogakTitle(title: string): string {
  return title;
}
