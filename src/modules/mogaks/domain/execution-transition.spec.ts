import { describe, expect, it } from 'vitest';

import { decideExecutionTransition } from './execution-transition';

describe('Jogak execution transitions', () => {
  it('creates an execution in any requested initial stored state', () => {
    expect(decideExecutionTransition(null, 'IN_PROGRESS')).toEqual({ type: 'INSERT' });
    expect(decideExecutionTransition(null, 'SUCCESS')).toEqual({ type: 'INSERT' });
    expect(decideExecutionTransition(null, 'FAIL')).toEqual({ type: 'INSERT' });
  });

  it('treats a request for the current state as idempotent', () => {
    expect(decideExecutionTransition('IN_PROGRESS', 'IN_PROGRESS')).toEqual({ type: 'NOOP' });
    expect(decideExecutionTransition('SUCCESS', 'SUCCESS')).toEqual({ type: 'NOOP' });
  });

  it('allows IN_PROGRESS to complete and completed states to switch outcome', () => {
    expect(decideExecutionTransition('IN_PROGRESS', 'SUCCESS')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('IN_PROGRESS', 'FAIL')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('SUCCESS', 'FAIL')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('FAIL', 'SUCCESS')).toEqual({ type: 'UPDATE' });
  });

  it('does not reopen a completed execution', () => {
    expect(decideExecutionTransition('SUCCESS', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
    expect(decideExecutionTransition('FAIL', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
  });
});
