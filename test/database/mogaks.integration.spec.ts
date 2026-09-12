import { randomUUID } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

import type { Database } from '@infra/database/database.provider';
import { DomainErrorCode } from '@core/common/error/domainException';
import { MogakPersistenceException } from '@core/mogaks/domain/exception/mogakPersistence.exception';
import * as schema from '@infra/database/schema';
import {
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogaks,
  posts,
  users,
} from '@infra/database/schema';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { JogaksService } from '@core/mogaks/application/service/jogaks.service';
import { MogakService } from '@core/mogaks/application/service/mogak.service';
import { MogakRepository } from '@infra/mogaks/repository/mogak.repository';
import { pinoLoggerStub } from '../fixtures/pinoLogger.fixture';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

afterAll(async () => {
  await pool.end();
});

describe('모각 PostgreSQL 통합', () => {
  it('모다랏 삭제는 애플리케이션 트랜잭션으로 계층을 지우고 게시글은 보존한다', async () => {
    const fixture = await createJogakFixture();
    const [execution] = await db
      .insert(jogakExecutions)
      .values({
        jogakId: fixture.jogakId,
        scheduledDate: '2026-07-23',
        status: 'SUCCESS',
        jogakTitleSnapshot: '문제 풀이',
      })
      .returning({ id: jogakExecutions.id });
    if (execution === undefined) throw new Error('execution fixture insert did not return a row');
    const [post] = await db
      .insert(posts)
      .values({
        jogakExecutionId: execution.id,
        authorId: fixture.userId,
        contents: '보존할 회고',
      })
      .returning({ id: posts.id });
    if (post === undefined) throw new Error('post fixture insert did not return a row');

    const repository = new MogakRepository(db as unknown as Database, pinoLoggerStub());
    await expect(repository.deleteOwnedModarat(fixture.userId, fixture.modaratId)).resolves.toBe(
      true,
    );

    await expect(rowCount(modarats, modarats.id, fixture.modaratId)).resolves.toBe(0);
    await expect(rowCount(mogaks, mogaks.id, fixture.mogakId)).resolves.toBe(0);
    await expect(rowCount(jogaks, jogaks.id, fixture.jogakId)).resolves.toBe(0);
    await expect(rowCount(jogakSchedules, jogakSchedules.jogakId, fixture.jogakId)).resolves.toBe(
      0,
    );
    await expect(rowCount(jogakExecutions, jogakExecutions.jogakId, fixture.jogakId)).resolves.toBe(
      0,
    );
    await expect(db.select().from(posts).where(eq(posts.id, post.id))).resolves.toHaveLength(1);
  });

  it('같은 실행 발생을 동시에 삽입해도 하나만 저장한다', async () => {
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
  });

  it('일곱 개 모각에서 동시 생성해도 여덟 개 상한을 넘기지 않는다', async () => {
    const fixture = await createJogakFixture();
    await db.insert(mogaks).values(
      Array.from({ length: 6 }, (_, index) => ({
        modaratId: fixture.modaratId,
        title: `추가 모각 ${index + 2}`,
        customCategoryName: `직접 입력 ${index + 2}`,
      })),
    );
    const service = new MogakService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
    );

    const results = await Promise.allSettled([
      service.createMogak(fixture.userId, {
        modaratId: fixture.modaratId,
        title: '동시 모각 A',
        customCategoryName: '동시 입력 A',
      }),
      service.createMogak(fixture.userId, {
        modaratId: fixture.modaratId,
        title: '동시 모각 B',
        customCategoryName: '동시 입력 B',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: DomainErrorCode.MAX_MOGAKS },
    });
    await expect(
      db.select().from(mogaks).where(eq(mogaks.modaratId, fixture.modaratId)),
    ).resolves.toHaveLength(8);
  });

  it('일곱 개의 현재 조각에서 동시 생성해도 여덟 개 상한을 넘기지 않는다', async () => {
    const fixture = await createJogakFixture();
    const extraJogaks = await db
      .insert(jogaks)
      .values(
        Array.from({ length: 6 }, (_, index) => ({
          mogakId: fixture.mogakId,
          title: `추가 조각 ${index + 2}`,
        })),
      )
      .returning({ id: jogaks.id });
    await db.insert(jogakSchedules).values(
      extraJogaks.map((jogak) => ({
        jogakId: jogak.id,
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-24',
      })),
    );
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    const results = await Promise.allSettled([
      service.create(fixture.userId, {
        mogakId: fixture.mogakId,
        title: '동시 조각 A',
        schedule: { scheduleType: 'ONCE', effectiveFrom: '2026-07-25' },
      }),
      service.create(fixture.userId, {
        mogakId: fixture.mogakId,
        title: '동시 조각 B',
        schedule: { scheduleType: 'ONCE', effectiveFrom: '2026-07-26' },
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: DomainErrorCode.MAX_MOGAKS },
    });
    await expect(
      db.select().from(jogaks).where(eq(jogaks.mogakId, fixture.mogakId)),
    ).resolves.toHaveLength(8);
  });

  it('조각 생성과 모각 삭제가 겹쳐도 부모에서 자식 순서로 대기하고 교착하지 않는다', async () => {
    const fixture = await createJogakFixture();
    const baseRepository = new MogakRepository(db as unknown as Database, pinoLoggerStub());
    const mogak = await baseRepository.findOwnedMogak(fixture.userId, fixture.mogakId);
    if (mogak === null) throw new Error('mogak fixture did not exist');

    const blocker = await pool.connect();
    const creating = await pool.connect();
    const deleting = await pool.connect();
    try {
      await blocker.query('begin');
      await blocker.query('select modarat_id from modarat where modarat_id = $1 for update', [
        fixture.modaratId,
      ]);

      const createRepository = new MogakRepository(
        drizzle(creating, { schema }) as unknown as Database,
        pinoLoggerStub(),
      );
      const deleteRepository = new MogakRepository(
        drizzle(deleting, { schema }) as unknown as Database,
        pinoLoggerStub(),
      );
      const creatingOperation = createRepository.createJogakWithSchedule({
        userId: fixture.userId,
        mogak,
        title: '교차 생성',
        schedule: {
          scheduleType: 'ONCE',
          effectiveFrom: '2026-07-24',
          effectiveTo: null,
          weekdays: [],
        },
        today: '2026-07-23',
      });
      await waitForLock(await backendPid(creating));
      const deletingOperation = deleteRepository.deleteOwnedMogak(fixture.userId, fixture.mogakId);
      await waitForLock(await backendPid(deleting));

      await blocker.query('commit');
      const outcomes = await Promise.allSettled([creatingOperation, deletingOperation]);
      expectHierarchyRaceOutcomes(outcomes);
      await expect(rowCount(mogaks, mogaks.id, fixture.mogakId)).resolves.toBe(0);
      await expect(rowCount(jogaks, jogaks.id, fixture.jogakId)).resolves.toBe(0);
    } finally {
      await safelyRollback(blocker);
      await safelyRollback(creating);
      await safelyRollback(deleting);
      blocker.release();
      creating.release();
      deleting.release();
    }
  });

  it('조각 생성과 회원 탈퇴가 겹쳐도 부모 잠금 순서가 일치해 교착하지 않는다', async () => {
    const fixture = await createJogakFixture();
    const baseRepository = new MogakRepository(db as unknown as Database, pinoLoggerStub());
    const mogak = await baseRepository.findOwnedMogak(fixture.userId, fixture.mogakId);
    if (mogak === null) throw new Error('mogak fixture did not exist');

    const blocker = await pool.connect();
    const creating = await pool.connect();
    const withdrawing = await pool.connect();
    try {
      await blocker.query('begin');
      await blocker.query('select modarat_id from modarat where modarat_id = $1 for update', [
        fixture.modaratId,
      ]);

      const createRepository = new MogakRepository(
        drizzle(creating, { schema }) as unknown as Database,
        pinoLoggerStub(),
      );
      const createOperation = createRepository.createJogakWithSchedule({
        userId: fixture.userId,
        mogak,
        title: '탈퇴 교차 생성',
        schedule: {
          scheduleType: 'ONCE',
          effectiveFrom: '2026-07-24',
          effectiveTo: null,
          weekdays: [],
        },
        today: '2026-07-23',
      });
      await waitForLock(await backendPid(creating));
      const withdrawOperation = new AuthRepository(
        drizzle(withdrawing, { schema }) as never,
      ).deleteUser(fixture.userId);
      await waitForLock(await backendPid(withdrawing));

      await blocker.query('commit');
      const outcomes = await Promise.allSettled([createOperation, withdrawOperation]);
      expectHierarchyRaceOutcomes(outcomes);
      await expect(
        db.select().from(users).where(eq(users.id, fixture.userId)),
      ).resolves.toHaveLength(0);
      await expect(rowCount(modarats, modarats.id, fixture.modaratId)).resolves.toBe(0);
    } finally {
      await safelyRollback(blocker);
      await safelyRollback(creating);
      await safelyRollback(withdrawing);
      blocker.release();
      creating.release();
      withdrawing.release();
    }
  });

  it('조각 제목이 바뀐 뒤에도 실행 제목 스냅샷을 유지한다', async () => {
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
  });

  it('과거 한 번 일정 여덟 개는 미래 조각 생성을 막지 않는다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-01',
    });
    const pastJogaks = await db
      .insert(jogaks)
      .values(
        Array.from({ length: 7 }, (_, index) => ({
          mogakId: fixture.mogakId,
          title: `과거 일정 ${index + 2}`,
        })),
      )
      .returning({ id: jogaks.id });
    await db.insert(jogakSchedules).values(
      pastJogaks.map((jogak) => ({
        jogakId: jogak.id,
        scheduleType: 'ONCE',
        effectiveFrom: '2026-07-01',
      })),
    );

    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await expect(
      service.create(fixture.userId, {
        mogakId: fixture.mogakId,
        title: '미래 루틴',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-24',
          weekdays: ['FRIDAY'],
        },
      }),
    ).resolves.toMatchObject({ title: '미래 루틴' });
  });

  it('KST 오늘 활성인 일정만 수정하고 후속 일정 행은 보존한다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-01',
      weekdays: ['WEDNESDAY'],
    });
    const [successor] = await db
      .insert(jogakSchedules)
      .values({
        jogakId: fixture.jogakId,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-08-01',
      })
      .returning({ id: jogakSchedules.id });
    if (successor === undefined)
      throw new Error('successor schedule fixture insert did not return a row');
    await db
      .insert(jogakScheduleWeekdays)
      .values({ scheduleId: successor.id, weekday: 'THURSDAY' });

    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await expect(
      service.update(fixture.userId, fixture.jogakId, {
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          weekdays: ['THURSDAY'],
        },
      }),
    ).resolves.toMatchObject({ title: '수정된 문제 풀이' });

    const [replacement] = await db
      .select({ effectiveTo: jogakSchedules.effectiveTo })
      .from(jogakSchedules)
      .where(
        and(
          eq(jogakSchedules.jogakId, fixture.jogakId),
          eq(jogakSchedules.effectiveFrom, '2026-07-01'),
        ),
      );
    expect(replacement?.effectiveTo).toBe('2026-07-31');
    await expect(
      db
        .select({ id: jogakSchedules.id })
        .from(jogakSchedules)
        .where(
          and(eq(jogakSchedules.id, successor.id), eq(jogakSchedules.effectiveFrom, '2026-08-01')),
        ),
    ).resolves.toHaveLength(1);
    await expect(service.listDay(fixture.userId, '2026-08-06')).resolves.toMatchObject({
      size: 1,
      jogaks: [{ jogakId: fixture.jogakId, scheduledDate: '2026-08-06' }],
    });
  });

  it('KST 오늘 활성인 일정을 한 번 일정으로 바꾸면 시작일을 보존한다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-01',
      weekdays: ['WEDNESDAY'],
    });
    const [futureSchedule] = await db
      .insert(jogakSchedules)
      .values({
        jogakId: fixture.jogakId,
        scheduleType: 'WEEKLY',
        effectiveFrom: '2026-08-01',
      })
      .returning({ id: jogakSchedules.id });
    if (futureSchedule === undefined)
      throw new Error('future schedule fixture did not return a row');
    await db.insert(jogakScheduleWeekdays).values({
      scheduleId: futureSchedule.id,
      weekday: 'FRIDAY',
    });
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await expect(
      service.update(fixture.userId, fixture.jogakId, {
        title: '한 번만 수행',
        schedule: { scheduleType: 'ONCE', weekdays: [] },
      }),
    ).resolves.toMatchObject({ title: '한 번만 수행' });

    const [replacement] = await db
      .select({
        scheduleType: jogakSchedules.scheduleType,
        effectiveFrom: jogakSchedules.effectiveFrom,
        effectiveTo: jogakSchedules.effectiveTo,
      })
      .from(jogakSchedules)
      .where(
        and(
          eq(jogakSchedules.jogakId, fixture.jogakId),
          eq(jogakSchedules.effectiveFrom, '2026-07-01'),
        ),
      );
    expect(replacement).toEqual({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    });
    const detail = await service.getDetail(fixture.userId, fixture.jogakId);
    expect(detail.schedules).toContainEqual({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
      weekdays: [],
    });
  });

  it('같은 시작일의 반복 일정은 행 ID를 보존하고 요일을 교체한다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-23',
      weekdays: ['WEDNESDAY'],
    });
    const [before] = await db
      .select({ id: jogakSchedules.id })
      .from(jogakSchedules)
      .where(eq(jogakSchedules.jogakId, fixture.jogakId));
    if (before === undefined) throw new Error('schedule fixture did not exist');
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await expect(
      service.update(fixture.userId, fixture.jogakId, {
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          weekdays: ['MONDAY', 'FRIDAY'],
        },
      }),
    ).resolves.toMatchObject({ title: '수정된 문제 풀이' });

    const [after] = await db
      .select({
        id: jogakSchedules.id,
        scheduleType: jogakSchedules.scheduleType,
        effectiveFrom: jogakSchedules.effectiveFrom,
      })
      .from(jogakSchedules)
      .where(eq(jogakSchedules.jogakId, fixture.jogakId));
    expect(after).toEqual({
      id: before.id,
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-23',
    });
    await expect(
      db
        .select({ weekday: jogakScheduleWeekdays.weekday })
        .from(jogakScheduleWeekdays)
        .where(eq(jogakScheduleWeekdays.scheduleId, before.id))
        .orderBy(asc(jogakScheduleWeekdays.weekday)),
    ).resolves.toEqual([{ weekday: 'FRIDAY' }, { weekday: 'MONDAY' }]);
  });

  it('같은 시작일의 반복 일정을 한 번 일정으로 바꾸면 종료일과 요일을 지운다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-23',
      effectiveTo: '2026-08-31',
      weekdays: ['WEDNESDAY'],
    });
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await service.update(fixture.userId, fixture.jogakId, {
      title: '한 번만 수행',
      schedule: { scheduleType: 'ONCE', weekdays: [] },
    });

    const [schedule] = await db
      .select({
        id: jogakSchedules.id,
        scheduleType: jogakSchedules.scheduleType,
        effectiveTo: jogakSchedules.effectiveTo,
      })
      .from(jogakSchedules)
      .where(eq(jogakSchedules.jogakId, fixture.jogakId));
    expect(schedule).toEqual(expect.objectContaining({ scheduleType: 'ONCE', effectiveTo: null }));
    if (schedule === undefined) throw new Error('updated schedule did not exist');
    await expect(
      db
        .select({ weekday: jogakScheduleWeekdays.weekday })
        .from(jogakScheduleWeekdays)
        .where(eq(jogakScheduleWeekdays.scheduleId, schedule.id)),
    ).resolves.toHaveLength(0);
  });

  it('같은 시작일 일정 수정은 기존 실행 기록을 보존한다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-23',
      weekdays: ['WEDNESDAY'],
    });
    const [execution] = await db
      .insert(jogakExecutions)
      .values({
        jogakId: fixture.jogakId,
        scheduledDate: '2026-07-23',
        status: 'SUCCESS',
        jogakTitleSnapshot: '문제 풀이',
      })
      .returning({
        id: jogakExecutions.id,
        jogakTitleSnapshot: jogakExecutions.jogakTitleSnapshot,
      });
    if (execution === undefined) throw new Error('execution fixture insert did not return a row');
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database, pinoLoggerStub()),
      () => '2026-07-23',
    );

    await service.update(fixture.userId, fixture.jogakId, {
      title: '수정된 문제 풀이',
      schedule: {
        scheduleType: 'WEEKLY',
        weekdays: ['THURSDAY'],
      },
    });

    await expect(
      db
        .select({ id: jogakExecutions.id, title: jogakExecutions.jogakTitleSnapshot })
        .from(jogakExecutions)
        .where(eq(jogakExecutions.id, execution.id)),
    ).resolves.toEqual([{ id: execution.id, title: '문제 풀이' }]);
  });
});

async function createJogakFixture(
  schedule: Readonly<{
    scheduleType: 'ONCE' | 'WEEKLY';
    effectiveFrom: string;
    effectiveTo?: string;
    weekdays?: readonly string[];
  }> = { scheduleType: 'ONCE', effectiveFrom: '2026-07-23' },
) {
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
  const [createdSchedule] = await db
    .insert(jogakSchedules)
    .values({
      jogakId: jogak.id,
      scheduleType: schedule.scheduleType,
      effectiveFrom: schedule.effectiveFrom,
      effectiveTo: schedule.effectiveTo ?? null,
    })
    .returning({ id: jogakSchedules.id });
  if (createdSchedule === undefined)
    throw new Error('schedule fixture insert did not return a row');
  if ((schedule.weekdays?.length ?? 0) > 0) {
    await db
      .insert(jogakScheduleWeekdays)
      .values(schedule.weekdays!.map((weekday) => ({ scheduleId: createdSchedule.id, weekday })));
  }

  return { userId: user.id, modaratId: modarat.id, mogakId: mogak.id, jogakId: jogak.id };
}

async function backendPid(client: PoolClient): Promise<number> {
  const [backend] = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows;
  if (backend === undefined) throw new Error('backend pid was not returned');
  return backend.pid;
}

async function waitForLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [activity] = (
      await pool.query<{ blocked: boolean }>(
        'select cardinality(pg_blocking_pids($1)) > 0 as blocked',
        [pid],
      )
    ).rows;
    if (activity?.blocked === true) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('transaction did not enter lock wait state');
}

async function safelyRollback(client: PoolClient): Promise<void> {
  try {
    await client.query('rollback');
  } catch {
    // The transaction may already have completed.
  }
}

function expectHierarchyRaceOutcomes(outcomes: readonly PromiseSettledResult<unknown>[]): void {
  expect(outcomes).toHaveLength(2);
  const [writer, remover] = outcomes;
  if (writer === undefined || remover === undefined) {
    throw new Error('concurrency operation did not return both outcomes');
  }
  if (remover.status !== 'fulfilled' || remover.value !== true) {
    throw new Error(`removal outcome was not fulfilled: ${JSON.stringify(remover)}`);
  }
  if (writer.status === 'fulfilled') {
    expect(writer.value).toEqual(
      expect.objectContaining({
        jogakId: expect.any(Number),
        mogakId: expect.any(Number),
      }),
    );
  } else {
    expect(writer.reason).toBeInstanceOf(MogakPersistenceException);
    expect(writer.reason).toMatchObject({ message: 'Mogak did not exist' });
  }
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      expect(hasErrorCode(outcome.reason, '40P01')).toBe(false);
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    if ('code' in current && current.code === code) return true;
    seen.add(current);
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
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
