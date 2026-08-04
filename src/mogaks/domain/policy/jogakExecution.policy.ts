import type { JogakExecutionTransition, JogakExecutionStatus } from '../vo/jogakExecution.vo';

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
