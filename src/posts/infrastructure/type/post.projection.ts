export type CreatedPostProjection = Readonly<{
  id: number;
  jogakExecutionId: number;
  authorId: number;
  jogakId: number;
  scheduledDate: string;
  contents: string;
  createdAt: Date;
}>;
