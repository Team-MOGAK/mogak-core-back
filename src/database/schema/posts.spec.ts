import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './index';

type Column = Readonly<{ dataType: string; notNull: boolean }>;
type PostsSchema = Readonly<{
  posts: Readonly<{ id: Column; jogakExecutionId: Column; authorId: Column }>;
  postImages: Readonly<{ postId: Column; storageKey: Column }>;
  postComments: Readonly<{ postId: Column; authorId: Column; contents: Column }>;
  postLikes: Readonly<{ postId: Column; userId: Column }>;
}>;

const postsSchema = schema as Partial<PostsSchema>;

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.getName())
    .filter((name): name is string => name !== undefined);
}

describe('posts schema', () => {
  it('uses bigint ownership columns for the execution, post author, comments, and likes', () => {
    expect(postsSchema.posts).toBeDefined();
    expect(postsSchema.postImages).toBeDefined();
    expect(postsSchema.postComments).toBeDefined();
    expect(postsSchema.postLikes).toBeDefined();

    if (
      postsSchema.posts === undefined ||
      postsSchema.postImages === undefined ||
      postsSchema.postComments === undefined ||
      postsSchema.postLikes === undefined
    ) {
      return;
    }

    expect(postsSchema.posts.id.dataType).toBe('number');
    expect(postsSchema.posts.jogakExecutionId.notNull).toBe(true);
    expect(postsSchema.posts.authorId.notNull).toBe(true);
    expect(postsSchema.postImages.postId.notNull).toBe(true);
    expect(postsSchema.postImages.storageKey.notNull).toBe(true);
    expect(postsSchema.postComments.postId.notNull).toBe(true);
    expect(postsSchema.postComments.authorId.notNull).toBe(true);
    expect(postsSchema.postComments.contents.notNull).toBe(true);
    expect(postsSchema.postLikes.postId.notNull).toBe(true);
    expect(postsSchema.postLikes.userId.notNull).toBe(true);
  });

  it('adds only the execution-post and post-user natural uniqueness rules', () => {
    expect(postsSchema.posts).toBeDefined();
    expect(postsSchema.postLikes).toBeDefined();

    if (postsSchema.posts === undefined || postsSchema.postLikes === undefined) {
      return;
    }

    expect(
      uniqueConstraintNames(postsSchema.posts as unknown as Parameters<typeof getTableConfig>[0]),
    ).toContain('posts_jogak_execution_id_unique');
    expect(
      uniqueConstraintNames(postsSchema.postLikes as unknown as Parameters<typeof getTableConfig>[0]),
    ).toContain('post_likes_post_user_unique');
  });
});
