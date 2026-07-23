import { decideExecutionTransition } from './execution-transition';

describe('조각 실행 상태 전이', () => {
  it('요청한 초기 저장 상태로 실행을 생성한다', () => {
    expect(decideExecutionTransition(null, 'IN_PROGRESS')).toEqual({ type: 'INSERT' });
    expect(decideExecutionTransition(null, 'SUCCESS')).toEqual({ type: 'INSERT' });
    expect(decideExecutionTransition(null, 'FAIL')).toEqual({ type: 'INSERT' });
  });

  it('현재 상태로의 요청은 멱등하게 처리한다', () => {
    expect(decideExecutionTransition('IN_PROGRESS', 'IN_PROGRESS')).toEqual({ type: 'NOOP' });
    expect(decideExecutionTransition('SUCCESS', 'SUCCESS')).toEqual({ type: 'NOOP' });
  });

  it('진행 중 실행은 완료할 수 있고 완료 상태는 결과를 바꿀 수 있다', () => {
    expect(decideExecutionTransition('IN_PROGRESS', 'SUCCESS')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('IN_PROGRESS', 'FAIL')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('SUCCESS', 'FAIL')).toEqual({ type: 'UPDATE' });
    expect(decideExecutionTransition('FAIL', 'SUCCESS')).toEqual({ type: 'UPDATE' });
  });

  it('완료된 실행을 다시 진행 상태로 열지 않는다', () => {
    expect(decideExecutionTransition('SUCCESS', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
    expect(decideExecutionTransition('FAIL', 'IN_PROGRESS')).toEqual({ type: 'REJECT' });
  });
});
