import { sql, type SQL } from 'drizzle-orm';

/**
 * Serializes mutations that can be invalidated by a user's withdrawal.
 *
 * The lock is transaction-scoped, database-wide, and deliberately keyed only
 * by the user id. Callers must acquire every related user lock in ascending
 * order before re-validating ownership/existence and performing DML.
 */
export async function lockUsersForTransaction(
  tx: { execute(query: SQL): Promise<unknown> },
  userIds: readonly number[],
): Promise<void> {
  const uniqueIds = [...new Set(userIds)].sort((left, right) => left - right);
  for (const userId of uniqueIds) {
    await tx.execute(sql`select pg_advisory_xact_lock(${userId})`);
  }
}
