export const OWNED_MOGAK_PORT = Symbol('OWNED_MOGAK_PORT');
export interface OwnedMogakPort {
  resolveOwnedMogak(userId: number, mogakId: number): Promise<Readonly<{ id: number }>>;
}
