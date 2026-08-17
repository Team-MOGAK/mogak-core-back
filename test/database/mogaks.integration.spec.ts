import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Database } from '@infra/database/database.provider';
import {
  jogakExecutions,
  jogakSchedules,
  jogakScheduleWeekdays,
  jogaks,
  modarats,
  mogaks,
  users,
} from '@infra/database/schema';
import { JogaksService } from '@core/mogaks/application/service/jogaks.service';
import { MogakRepository } from '@infra/mogaks/repository/mogak.repository';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

afterAll(async () => {
  await pool.end();
});

describe('모각 PostgreSQL 통합', () => {
  it('사용자를 삭제하면 소유한 모각 계층 전체를 외래키 cascade로 하드 삭제한다', async () => {
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

    await db.delete(users).where(eq(users.id, fixture.userId));
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

    await db.delete(users).where(eq(users.id, fixture.userId));
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
      new MogakRepository(db as unknown as Database),
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

    await db.delete(users).where(eq(users.id, fixture.userId));
  });

  it('후속 일정 전까지만 교체 일정을 저장해 가상 발생 중복을 만들지 않는다', async () => {
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
      new MogakRepository(db as unknown as Database),
      () => '2026-07-23',
    );

    await expect(
      service.update(fixture.userId, fixture.jogakId, {
        title: '수정된 문제 풀이',
        schedule: {
          scheduleType: 'WEEKLY',
          effectiveFrom: '2026-07-24',
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
          eq(jogakSchedules.effectiveFrom, '2026-07-24'),
        ),
      );
    expect(replacement?.effectiveTo).toBe('2026-07-31');
    await expect(service.listDay(fixture.userId, '2026-08-06')).resolves.toMatchObject({
      size: 1,
      jogaks: [expect.objectContaining({ scheduledDate: '2026-08-06' })],
    });

    await db.delete(users).where(eq(users.id, fixture.userId));
  });

  it('후속 일정 사이에 넣은 한 번 일정의 종료일은 null로 유지한다', async () => {
    const fixture = await createJogakFixture({
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-01',
      weekdays: ['WEDNESDAY'],
    });
    await db.insert(jogakSchedules).values({
      jogakId: fixture.jogakId,
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-08-01',
    });
    const service = new JogaksService(
      new MogakRepository(db as unknown as Database),
      () => '2026-07-23',
    );

    await expect(
      service.update(fixture.userId, fixture.jogakId, {
        title: '한 번만 수행',
        schedule: { scheduleType: 'ONCE', effectiveFrom: '2026-07-24' },
      }),
    ).resolves.toMatchObject({ title: '한 번만 수행' });

    const [replacement] = await db
      .select({ effectiveTo: jogakSchedules.effectiveTo })
      .from(jogakSchedules)
      .where(
        and(
          eq(jogakSchedules.jogakId, fixture.jogakId),
          eq(jogakSchedules.effectiveFrom, '2026-07-24'),
        ),
      );
    expect(replacement?.effectiveTo).toBeNull();
    const detail = await service.getDetail(fixture.userId, fixture.jogakId);
    expect(detail.schedules).toContainEqual({
      scheduleType: 'ONCE',
      effectiveFrom: '2026-07-24',
      effectiveTo: null,
      weekdays: [],
    });

    await db.delete(users).where(eq(users.id, fixture.userId));
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
