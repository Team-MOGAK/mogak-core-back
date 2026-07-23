import type { StoredExecutionStatus } from './occurrence';

export type ExecutionTransition = Readonly<{ type: 'INSERT' | 'NOOP' | 'UPDATE' | 'REJECT' }>;

export function decideExecutionTransition(
  current: StoredExecutionStatus | null,
  desired: StoredExecutionStatus,
): ExecutionTransition {
  if (current === null) return { type: 'INSERT' };
  if (current === desired) return { type: 'NOOP' };
  if (desired === 'IN_PROGRESS') return { type: 'REJECT' };

  return { type: 'UPDATE' };
}
