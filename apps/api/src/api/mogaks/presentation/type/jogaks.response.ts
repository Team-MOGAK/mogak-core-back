export type ExecutionResponse = Readonly<{
  executionId: number;
  jogakId: number;
  scheduledDate: string;
  status: string;
  title: string;
}>;
