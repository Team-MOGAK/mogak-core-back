export type OccurrenceQuery = Readonly<{
  userId: number;
  startDate?: string;
  endDate?: string;
  modaratId?: number;
  mogakId?: number;
  jogakId?: number;
  scheduleType?: 'ONCE' | 'WEEKLY';
}>;
