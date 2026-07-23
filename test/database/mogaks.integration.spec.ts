import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  jogakExecutions,
  jogakSchedules,
  jogaks,
  modarats,
  mogaks,
  users,
} from '../../src/database/schema';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

afterAll(async () => {
  await pool.end();
});

describe('Mogaks PostgreSQL integration', () => {
  it('hard-deletes the complete user-owned Mogak hierarchy through foreign-key cascades', async () => {
    const fixture = await createJogakFixture();
    await db.insert(jogakExecutions).values({
      jogakId: fixture.jogakId,
      scheduledDate: '2026-07-23',
      status: 'SUCCESS',
      jogakTitleSnapshot: '문제 풀이',
    });

    await db.delete(users).where(eq(users.id, fixture.userId));

    await expect(rowCount(modarats, modarats.id, fixture.modaratId)).resolves.toBe(0);
    await expect(rowCount(mogaks, mogaks.id, fixture.mogakId)).resolves.toBe(0);
    await expect(rowCount(jogaks, jogaks.id, fixture.jogakId)).resolves.toBe(0);
    await expect(rowCount(jogakSchedules, jogakSchedules.jogakId, fixture.jogakId)).resolves.toBe(
      0,
    );
    await expect(rowCount(jogakExecutions, jogakExecutions.jogakId, fixture.jogakId)).resolves.toBe(
      0,
    );
  });

  it('persists only one execution for concurrent same-occurrence inserts', async () => {
    const fixture = await createJogakFixture();
    const insert = () =>
      db
        .insert(jogakExecutions)
        .values({
          jogakId: fixture.jogakId,
          scheduledDate: '2026-07-23',
          status: 'IN_PROGRESS',
          jogakTitleSnapshot: '문제 풀이',
        })
        .onConflictDoNothing({ target: [jogakExecutions.jogakId, jogakExecutions.scheduledDate] })
        .returning({ id: jogakExecutions.id });

    const results = await Promise.all([insert(), insert()]);
    expect(results.filter((result) => result.length === 1)).toHaveLength(1);
    await expect(rowCount(jogakExecutions, jogakExecutions.jogakId, fixture.jogakId)).resolves.toBe(
      1,
    );

    await db.delete(users).where(eq(users.id, fixture.userId));
  });

  it('preserves an execution title snapshot after the Jogak title changes', async () => {
    const fixture = await createJogakFixture();
    await db.insert(jogakExecutions).values({
      jogakId: fixture.jogakId,
      scheduledDate: '2026-07-23',
      status: 'SUCCESS',
      jogakTitleSnapshot: '문제 풀이',
    });
    await db
      .update(jogaks)
      .set({ title: '수정된 문제 풀이' })
      .where(eq(jogaks.id, fixture.jogakId));

    const [execution] = await db
      .select({ title: jogakExecutions.jogakTitleSnapshot })
      .from(jogakExecutions)
      .where(
        and(
          eq(jogakExecutions.jogakId, fixture.jogakId),
          eq(jogakExecutions.scheduledDate, '2026-07-23'),
        ),
      );
    expect(execution?.title).toBe('문제 풀이');

    await db.delete(users).where(eq(users.id, fixture.userId));
  });
});

async function createJogakFixture() {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
    .returning({ id: users.id });
  if (user === undefined) throw new Error('user fixture insert did not return a row');
  const [modarat] = await db
    .insert(modarats)
    .values({ userId: user.id, title: '목표', color: 'blue' })
    .returning({ id: modarats.id });
  if (modarat === undefined) throw new Error('modarat fixture insert did not return a row');
  const [mogak] = await db
    .insert(mogaks)
    .values({ modaratId: modarat.id, title: '자격증', customCategoryName: '직접 입력' })
    .returning({ id: mogaks.id });
  if (mogak === undefined) throw new Error('mogak fixture insert did not return a row');
  const [jogak] = await db
    .insert(jogaks)
    .values({ mogakId: mogak.id, title: '문제 풀이' })
    .returning({ id: jogaks.id });
  if (jogak === undefined) throw new Error('jogak fixture insert did not return a row');
  await db.insert(jogakSchedules).values({
    jogakId: jogak.id,
    scheduleType: 'ONCE',
    effectiveFrom: '2026-07-23',
  });

  return { userId: user.id, modaratId: modarat.id, mogakId: mogak.id, jogakId: jogak.id };
}

async function rowCount<TTable extends typeof modarats | typeof mogaks | typeof jogaks>(
  table: TTable,
  column: TTable extends typeof modarats
    ? typeof modarats.id
    : TTable extends typeof mogaks
      ? typeof mogaks.id
      : typeof jogaks.id,
  id: number,
): Promise<number>;
async function rowCount(
  table: typeof jogakSchedules | typeof jogakExecutions,
  column: typeof jogakSchedules.jogakId | typeof jogakExecutions.jogakId,
  id: number,
): Promise<number>;
async function rowCount(
  table:
    | typeof modarats
    | typeof mogaks
    | typeof jogaks
    | typeof jogakSchedules
    | typeof jogakExecutions,
  column:
    | typeof modarats.id
    | typeof mogaks.id
    | typeof jogaks.id
    | typeof jogakSchedules.jogakId
    | typeof jogakExecutions.jogakId,
  id: number,
): Promise<number> {
  const rows = await db.select().from(table).where(eq(column, id));
  return rows.length;
}
