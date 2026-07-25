export const OWNED_OCCURRENCE_PORT = Symbol('OWNED_OCCURRENCE_PORT');
export interface OwnedOccurrencePort {
  resolveOwnedOccurrence(
    userId: number,
    jogakId: number,
    scheduledDate: string,
  ): Promise<Readonly<{ jogakId: number; mogakId: number; title: string }>>;
}
