import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from './database.provider';
import { jogaks, modarats, mogaks, users } from './schema';

/**
 * A single database-wide gate for account purges.
 *
 * This is intentionally transaction scoped.  A pooled connection must never
 * carry the gate into a later request.
 */
const WITHDRAWAL_LOCK_CLASS = 19_841;
const WITHDRAWAL_LOCK_KEY = 1;

type Transaction = Pick<Database, 'select'>;
type SelectTransaction = Pick<Database, 'select'>;

export type UserLockMode = 'key share' | 'update';

export async function lockWithdrawalGate(tx: Pick<Database, 'execute'>): Promise<void> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(${WITHDRAWAL_LOCK_CLASS}, ${WITHDRAWAL_LOCK_KEY})
  `);
}

/**
 * Lock every known participant in deterministic order.  Callers must provide
 * the strongest mode they will need before any resource or DML operation.
 */
export async function lockUsers(
  tx: Transaction,
  userIds: readonly number[],
  mode: UserLockMode = 'key share',
): Promise<readonly number[]> {
  const ids = [...new Set(userIds)].sort((left, right) => left - right);
  if (ids.length === 0) return [];

  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(asc(users.id))
    .for(mode);
  return rows.map((row) => row.id);
}

export function sortedUserIds(...userIds: readonly number[][]): number[] {
  return [...new Set(userIds.flat())].sort((left, right) => left - right);
}

/** Lock the modarat parent before the mogak child in a stable hierarchy order. */
export async function lockMogakHierarchy(
  tx: SelectTransaction,
  mogakId: number,
  userId?: number,
): Promise<{ modaratId: number; mogakId: number } | undefined> {
  const parentCondition =
    userId === undefined
      ? eq(mogaks.id, mogakId)
      : and(eq(mogaks.id, mogakId), eq(modarats.userId, userId));
  const [parent] = await tx
    .select({ modaratId: modarats.id })
    .from(mogaks)
    .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
    .where(parentCondition)
    .for('update', { of: modarats });
  if (parent === undefined) return undefined;

  const [child] = await tx
    .select({ id: mogaks.id })
    .from(mogaks)
    .where(and(eq(mogaks.id, mogakId), eq(mogaks.modaratId, parent.modaratId)))
    .for('update');
  if (child === undefined) return undefined;
  return { modaratId: parent.modaratId, mogakId: child.id };
}

/** Lock the modarat, mogak, and jogak rows in that hierarchy order. */
export async function lockJogakHierarchy(
  tx: SelectTransaction,
  jogakId: number,
  userId?: number,
): Promise<{ modaratId: number; mogakId: number; jogakId: number } | undefined> {
  const parentCondition =
    userId === undefined
      ? eq(jogaks.id, jogakId)
      : and(eq(jogaks.id, jogakId), eq(modarats.userId, userId));
  const [parent] = await tx
    .select({ modaratId: modarats.id, mogakId: mogaks.id })
    .from(jogaks)
    .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
    .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
    .where(parentCondition)
    .for('update', { of: modarats });
  if (parent === undefined) return undefined;

  const [mogak] = await tx
    .select({ id: mogaks.id })
    .from(mogaks)
    .where(and(eq(mogaks.id, parent.mogakId), eq(mogaks.modaratId, parent.modaratId)))
    .for('update');
  if (mogak === undefined) return undefined;

  const [jogak] = await tx
    .select({ id: jogaks.id })
    .from(jogaks)
    .where(and(eq(jogaks.id, jogakId), eq(jogaks.mogakId, mogak.id)))
    .for('update');
  if (jogak === undefined) return undefined;
  return { modaratId: parent.modaratId, mogakId: mogak.id, jogakId: jogak.id };
}

export async function lockMogakRows(tx: SelectTransaction, mogakIds: readonly number[]) {
  const ids = [...new Set(mogakIds)].sort((left, right) => left - right);
  if (ids.length === 0) return;
  await tx
    .select({ id: mogaks.id })
    .from(mogaks)
    .where(inArray(mogaks.id, ids))
    .orderBy(asc(mogaks.id))
    .for('update');
}

export async function lockJogakRows(tx: SelectTransaction, jogakIds: readonly number[]) {
  const ids = [...new Set(jogakIds)].sort((left, right) => left - right);
  if (ids.length === 0) return;
  await tx
    .select({ id: jogaks.id })
    .from(jogaks)
    .where(inArray(jogaks.id, ids))
    .orderBy(asc(jogaks.id))
    .for('update');
}
