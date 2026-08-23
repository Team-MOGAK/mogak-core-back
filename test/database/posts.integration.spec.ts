import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  jogakExecutions,
  jogaks,
  modarats,
  mogaks,
  postComments,
  postImages,
  postLikes,
  posts,
  follows,
  authSessions,
  socialAccounts,
  users,
} from '@infra/database/schema';
import { AuthRepository } from '@infra/auth/repository/auth.repository';

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
  it('작성자를 삭제하면 게시글과 모든 종속 행을 하드 삭제한다', async () => {
    const fixture = await createPostFixture();
    await insertPostDependents(fixture);

    await expect(new AuthRepository(db as never).deleteUser(fixture.userId)).resolves.toBe(true);

    await expect(postRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postImageRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(0);
    await expect(executionRows(fixture.executionId)).resolves.toHaveLength(0);
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
    await db.delete(posts).where(eq(posts.id, fixture.postId));

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
});

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
  return { userId: user.id, executionId: execution.id };
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
