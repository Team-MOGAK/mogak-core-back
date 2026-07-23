import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
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

describe('Posts PostgreSQL integration', () => {
  it('hard-deletes a post and every dependent row when its owner is deleted', async () => {
    const fixture = await createPostFixture();
    try {
      await insertPostDependents(fixture);
      await db.delete(users).where(eq(users.id, fixture.userId));

      await expect(postRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(postImageRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(executionRows(fixture.executionId)).resolves.toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
  });

  it('hard-deletes a post dependent row without deleting its execution', async () => {
    const fixture = await createPostFixture();
    try {
      await insertPostDependents(fixture);
      await db.delete(posts).where(eq(posts.id, fixture.postId));

      await expect(postImageRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(postCommentRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(0);
      await expect(executionRows(fixture.executionId)).resolves.toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
  });

  it('persists only one post when the same execution is inserted concurrently', async () => {
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

    try {
      const results = await Promise.all([insert(), insert()]);
      expect(results.filter((result) => result.length === 1)).toHaveLength(1);
      await expect(postsForExecution(fixture.executionId)).resolves.toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
  });

  it('persists only one like when the same user likes concurrently', async () => {
    const fixture = await createPostFixture();
    const insert = () =>
      db
        .insert(postLikes)
        .values({ postId: fixture.postId, userId: fixture.userId })
        .onConflictDoNothing({ target: [postLikes.postId, postLikes.userId] })
        .returning({ id: postLikes.id });

    try {
      const results = await Promise.all([insert(), insert()]);
      expect(results.filter((result) => result.length === 1)).toHaveLength(1);
      await expect(postLikeRows(fixture.postId)).resolves.toHaveLength(1);
    } finally {
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
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
