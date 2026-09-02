import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';

import {
  jogakExecutions,
  jogakScheduleWeekdays,
  jogakSchedules,
  jogaks,
  modarats,
  mogaks,
  consentItems,
  postComments,
  postImages,
  postLikes,
  posts,
  follows,
  authSessions,
  socialAccounts,
  userConsents,
  users,
} from '@infra/database/schema';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { PostRepository } from '@infra/posts/repository/post.repository';
import { pinoLoggerStub } from '../fixtures/pinoLogger.fixture';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

afterAll(async () => {
  await pool.end();
});

describe('게시글 PostgreSQL 통합', () => {
  it('작성자를 삭제하면 모든 회원 관계를 앱 코드로 하드 삭제한다', async () => {
    const fixture = await createPostFixture();
    const otherUserId = await insertWithdrawalDependents(fixture);

    await expect(new AuthRepository(db as never).deleteUser(fixture.userId)).resolves.toBe(true);

    await expect(db.select().from(users).where(eq(users.id, fixture.userId))).resolves.toHaveLength(
      0,
    );
    await expect(
      db.select().from(modarats).where(eq(modarats.id, fixture.modaratId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(mogaks).where(eq(mogaks.id, fixture.mogakId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(jogaks).where(eq(jogaks.id, fixture.jogakId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(jogakSchedules).where(eq(jogakSchedules.id, fixture.scheduleId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(jogakScheduleWeekdays)
        .where(eq(jogakScheduleWeekdays.id, fixture.weekdayId)),
    ).resolves.toHaveLength(0);
    await expect(postRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postImageRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(executionRows(fixture.executionId)).resolves.toHaveLength(0);
    await expect(
      db.select().from(authSessions).where(eq(authSessions.userId, fixture.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(socialAccounts).where(eq(socialAccounts.userId, fixture.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(userConsents).where(eq(userConsents.userId, fixture.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(follows).where(eq(follows.followerId, fixture.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(follows).where(eq(follows.followingId, fixture.userId)),
    ).resolves.toHaveLength(0);
    await expect(db.select().from(users).where(eq(users.id, otherUserId))).resolves.toHaveLength(1);
  });

  it('관계가 없는 계정도 삭제하고, 없는 사용자는 false를 반환한다', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
      .returning({ id: users.id });
    if (user === undefined) throw new Error('user fixture insert did not return a row');

    const repository = new AuthRepository(db as never);
    await expect(repository.deleteUser(user.id)).resolves.toBe(true);
    await expect(repository.deleteUser(user.id)).resolves.toBe(false);
  });

  it('A 탈퇴는 A 실행에 연결된 B 작성 게시글까지 지우되 B와 B 고유 관계는 보존한다', async () => {
    const fixture = await createExecutionFixture();
    const [other] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
      .returning({ id: users.id });
    if (other === undefined) throw new Error('other user fixture insert did not return a row');
    const [foreignPost] = await db
      .insert(posts)
      .values({
        jogakExecutionId: fixture.executionId,
        authorId: other.id,
        contents: 'B의 공유 회고',
      })
      .returning({ id: posts.id });
    if (foreignPost === undefined)
      throw new Error('foreign post fixture insert did not return a row');
    await db
      .insert(postComments)
      .values({ postId: foreignPost.id, authorId: other.id, contents: 'B 댓글' });
    await db.insert(postLikes).values({ postId: foreignPost.id, userId: other.id });
    await db.insert(follows).values({ followerId: other.id, followingId: fixture.userId });
    await db.insert(authSessions).values({
      id: randomUUID(),
      userId: other.id,
      refreshTokenHash: 'b'.repeat(64),
      expiresAt: new Date('2030-01-01'),
    });
    await db.insert(socialAccounts).values({
      userId: other.id,
      provider: 'GOOGLE',
      providerUserId: randomUUID(),
      email: `${randomUUID()}@mogak.test`,
    });

    await expect(new AuthRepository(db as never).deleteUser(fixture.userId)).resolves.toBe(true);

    await expect(db.select().from(posts).where(eq(posts.id, foreignPost.id))).resolves.toHaveLength(
      0,
    );
    await expect(db.select().from(users).where(eq(users.id, other.id))).resolves.toHaveLength(1);
    await expect(
      db.select().from(authSessions).where(eq(authSessions.userId, other.id)),
    ).resolves.toHaveLength(1);
    await expect(
      db.select().from(socialAccounts).where(eq(socialAccounts.userId, other.id)),
    ).resolves.toHaveLength(1);
  });

  it('외부 transaction이 rollback하면 탈퇴 purge 전체도 되돌린다', async () => {
    const fixture = await createPostFixture();
    await expect(
      db.transaction(async (tx) => {
        await new AuthRepository(tx as never).deleteUser(fixture.userId);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    await expect(db.select().from(users).where(eq(users.id, fixture.userId))).resolves.toHaveLength(
      1,
    );
    await expect(db.select().from(posts).where(eq(posts.id, fixture.postId))).resolves.toHaveLength(
      1,
    );
  });

  it('실행은 유지하고 게시글 종속 행만 하드 삭제한다', async () => {
    const fixture = await createPostFixture();
    await insertPostDependents(fixture);
    await expect(db.delete(posts).where(eq(posts.id, fixture.postId))).rejects.toMatchObject({
      cause: { code: '23503' },
    });
    await expect(
      new PostRepository(db as never, pinoLoggerStub()).deleteOwnedPost({
        postId: fixture.postId,
        authorId: fixture.userId,
      }),
    ).resolves.toBe(true);

    await expect(postImageRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(executionRows(fixture.executionId)).resolves.toHaveLength(1);
  });

  it('같은 실행의 게시글을 동시에 삽입해도 하나만 저장한다', async () => {
    const fixture = await createExecutionFixture();
    const insert = () =>
      db
        .insert(posts)
        .values({
          jogakExecutionId: fixture.executionId,
          authorId: fixture.userId,
          contents: '동시 생성 회고',
        })
        .onConflictDoNothing({ target: posts.jogakExecutionId })
        .returning({ id: posts.id });

    const results = await Promise.all([insert(), insert()]);
    expect(results.filter((result) => result.length === 1)).toHaveLength(1);
    await expect(postsForExecution(fixture.executionId)).resolves.toHaveLength(1);
  });

  it('같은 사용자가 동시에 좋아요해도 하나만 저장한다', async () => {
    const fixture = await createPostFixture();
    const insert = () =>
      db
        .insert(postLikes)
        .values({ postId: fixture.postId, userId: fixture.userId })
        .onConflictDoNothing({ target: [postLikes.postId, postLikes.userId] })
        .returning({ id: postLikes.id });

    const results = await Promise.all([insert(), insert()]);
    expect(results.filter((result) => result.length === 1)).toHaveLength(1);
    await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(1);
  });

  it('탈퇴는 다른 transaction의 user row lock이 해제된 뒤에만 삭제한다', async () => {
    const fixture = await createExecutionFixture();
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('begin');
      await first.query('select user_id from users where user_id = $1 for update', [
        fixture.userId,
      ]);
      const secondPid = await backendPid(second);

      const deletion = new AuthRepository(drizzle(second) as never).deleteUser(fixture.userId);
      await waitForLock(secondPid);
      await expect(
        db.select().from(users).where(eq(users.id, fixture.userId)),
      ).resolves.toHaveLength(1);

      await first.query('commit');
      await expect(deletion).resolves.toBe(true);
      await expect(
        db.select().from(users).where(eq(users.id, fixture.userId)),
      ).resolves.toHaveLength(0);
    } finally {
      await safelyRollback(first);
      await safelyRollback(second);
      first.release();
      second.release();
    }
  });

  it('lock된 게시글에는 댓글 FK insert가 탈퇴 transaction 종료까지 대기한다', async () => {
    const fixture = await createPostFixture();
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('begin');
      await first.query('select post_id from post where post_id = $1 for update', [fixture.postId]);
      const secondPid = await backendPid(second);
      await second.query('begin');
      const insert = second.query(
        'insert into post_comment (post_id, user_id, contents) values ($1, $2, $3)',
        [fixture.postId, fixture.userId, '대기 댓글'],
      );
      await waitForLock(secondPid);

      await first.query('commit');
      await expect(insert).resolves.toMatchObject({ rowCount: 1 });
      await second.query('commit');
      await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(1);
    } finally {
      await safelyRollback(first);
      await safelyRollback(second);
      first.release();
      second.release();
    }
  });

  it('실제 탈퇴 중 댓글·좋아요·팔로우 insert는 대기 후 부모 삭제로 실패한다', async () => {
    const fixture = await createPostFixture();
    const [other] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
      .returning({ id: users.id });
    if (other === undefined) throw new Error('other user fixture insert did not return a row');

    const blocker = await pool.connect();
    const deleting = await pool.connect();
    const commenting = await pool.connect();
    const liking = await pool.connect();
    const following = await pool.connect();
    try {
      await blocker.query('begin');
      await blocker.query('select post_id from post where post_id = $1 for update', [
        fixture.postId,
      ]);

      const deletingPid = await backendPid(deleting);
      const deletion = new AuthRepository(drizzle(deleting) as never).deleteUser(fixture.userId);
      await waitForLock(deletingPid);

      await commenting.query('begin');
      const commentPid = await backendPid(commenting);
      const comment = commenting.query(
        'insert into post_comment (post_id, user_id, contents) values ($1, $2, $3)',
        [fixture.postId, other.id, '탈퇴 중 댓글'],
      );
      await waitForLock(commentPid);

      await liking.query('begin');
      const likePid = await backendPid(liking);
      const like = liking.query('insert into post_like (post_id, user_id) values ($1, $2)', [
        fixture.postId,
        other.id,
      ]);
      await waitForLock(likePid);

      await following.query('begin');
      const followPid = await backendPid(following);
      const follow = following.query('insert into follow (from_id, to_id) values ($1, $2)', [
        other.id,
        fixture.userId,
      ]);
      await waitForLock(followPid);

      await blocker.query('commit');
      await expect(deletion).resolves.toBe(true);
      await expect(comment).rejects.toMatchObject({ code: '23503' });
      await expect(like).rejects.toMatchObject({ code: '23503' });
      await expect(follow).rejects.toMatchObject({ code: '23503' });
    } finally {
      await safelyRollback(blocker);
      await safelyRollback(commenting);
      await safelyRollback(liking);
      await safelyRollback(following);
      blocker.release();
      deleting.release();
      commenting.release();
      liking.release();
      following.release();
    }
  });
});

async function backendPid(client: PoolClient): Promise<number> {
  const [backend] = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows;
  if (backend === undefined) throw new Error('backend pid was not returned');
  return backend.pid;
}

async function waitForLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [activity] = (
      await pool.query<{ waiting: boolean }>(
        "select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = $1",
        [pid],
      )
    ).rows;
    if (activity?.waiting === true) return;
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

async function createPostFixture() {
  const execution = await createExecutionFixture();
  const [post] = await db
    .insert(posts)
    .values({
      jogakExecutionId: execution.executionId,
      authorId: execution.userId,
      contents: '오늘 회고',
    })
    .returning({ id: posts.id });
  if (post === undefined) throw new Error('post fixture insert did not return a row');
  return { ...execution, postId: post.id };
}

async function insertPostDependents(fixture: Readonly<{ userId: number; postId: number }>) {
  await db.insert(postImages).values({
    postId: fixture.postId,
    storageKey: 'posts/test.png',
    position: 0,
  });
  await db.insert(postComments).values({
    postId: fixture.postId,
    authorId: fixture.userId,
    contents: '댓글',
  });
  await db.insert(postLikes).values({ postId: fixture.postId, userId: fixture.userId });
}

async function insertWithdrawalDependents(
  fixture: Readonly<{ userId: number; postId: number }>,
): Promise<number> {
  await insertPostDependents(fixture);
  const [other] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@mogak.test`, role: 'USER' })
    .returning({ id: users.id });
  const [consentItem] = await db
    .insert(consentItems)
    .values({
      code: `WITHDRAWAL_TEST_${randomUUID()}`,
      name: '탈퇴 테스트 동의',
      required: false,
      active: true,
    })
    .returning({ id: consentItems.id });
  if (other === undefined || consentItem === undefined) {
    throw new Error('withdrawal dependent fixture insert did not return rows');
  }
  await db.insert(authSessions).values({
    id: randomUUID(),
    userId: fixture.userId,
    refreshTokenHash: 'a'.repeat(64),
    expiresAt: new Date('2030-01-01'),
  });
  await db.insert(socialAccounts).values({
    userId: fixture.userId,
    provider: 'GOOGLE',
    providerUserId: randomUUID(),
    email: `${randomUUID()}@mogak.test`,
  });
  await db.insert(userConsents).values({
    userId: fixture.userId,
    consentItemId: consentItem.id,
    agreed: true,
    agreedAt: new Date(),
  });
  await db.insert(follows).values([
    { followerId: fixture.userId, followingId: other.id },
    { followerId: other.id, followingId: fixture.userId },
  ]);
  return other.id;
}

async function createExecutionFixture() {
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
  const [schedule] = await db
    .insert(jogakSchedules)
    .values({
      jogakId: jogak.id,
      scheduleType: 'WEEKLY',
      effectiveFrom: '2026-07-20',
    })
    .returning({ id: jogakSchedules.id });
  if (schedule === undefined) throw new Error('schedule fixture insert did not return a row');
  const [weekday] = await db
    .insert(jogakScheduleWeekdays)
    .values({ scheduleId: schedule.id, weekday: 'THURSDAY' })
    .returning({ id: jogakScheduleWeekdays.id });
  if (weekday === undefined) throw new Error('weekday fixture insert did not return a row');
  const [execution] = await db
    .insert(jogakExecutions)
    .values({
      jogakId: jogak.id,
      scheduledDate: '2026-07-23',
      status: 'IN_PROGRESS',
      jogakTitleSnapshot: '문제 풀이',
    })
    .returning({ id: jogakExecutions.id });
  if (execution === undefined) throw new Error('execution fixture insert did not return a row');
  return {
    userId: user.id,
    modaratId: modarat.id,
    mogakId: mogak.id,
    jogakId: jogak.id,
    scheduleId: schedule.id,
    weekdayId: weekday.id,
    executionId: execution.id,
  };
}

function postRows(postId: number) {
  return db.select().from(posts).where(eq(posts.id, postId));
}

function postsForExecution(executionId: number) {
  return db.select().from(posts).where(eq(posts.jogakExecutionId, executionId));
}

function postImageRows(postId: number) {
  return db.select().from(postImages).where(eq(postImages.postId, postId));
}

function postCommentRows(postId: number) {
  return db.select().from(postComments).where(eq(postComments.postId, postId));
}

function postLikeRows(postId: number) {
  return db.select().from(postLikes).where(eq(postLikes.postId, postId));
}

function executionRows(executionId: number) {
  return db.select().from(jogakExecutions).where(eq(jogakExecutions.id, executionId));
}
