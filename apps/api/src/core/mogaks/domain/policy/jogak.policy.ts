export const MAX_JOGAKS_PER_MOGAK = 8;

export function validateJogakCapacity(existingCount: number): boolean {
  return existingCount < MAX_JOGAKS_PER_MOGAK;
}
