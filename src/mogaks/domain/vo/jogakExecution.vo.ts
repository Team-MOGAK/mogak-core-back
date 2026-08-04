const JOGAK_EXECUTION_STATUSES = ['IN_PROGRESS', 'SUCCESS', 'FAIL'] as const;

export type JogakExecutionStatus = (typeof JOGAK_EXECUTION_STATUSES)[number];
export type JogakOccurrenceStatus = JogakExecutionStatus | 'PENDING' | 'MISSED';

export type JogakExecutionTransition = Readonly<{
  type: 'INSERT' | 'NOOP' | 'UPDATE' | 'REJECT';
}>;

export const JogakExecutionStatus = {
  parse(value: string): JogakExecutionStatus {
    if ((JOGAK_EXECUTION_STATUSES as readonly string[]).includes(value)) {
      return value as JogakExecutionStatus;
    }
    throw new RangeError(`Unsupported Jogak execution status: ${value}`);
  },
};
