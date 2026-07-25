export type OccurrenceQuery = Readonly<{
  userId: number;
  startDate: string;
  endDate: string;
  mogakId?: number;
  jogakId?: number;
  scheduleType?: 'ONCE' | 'WEEKLY';
}>;
