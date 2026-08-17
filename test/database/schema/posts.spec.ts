import { getTableConfig } from 'drizzle-orm/pg-core';

import * as schema from '@infra/database/schema/index';

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

describe('게시글 데이터베이스 스키마', () => {
  it('실행과 게시글 작성자와 댓글과 좋아요에 bigint 소유 식별자를 사용한다', () => {
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

  it('실행 게시글과 게시글 사용자에 필요한 자연 고유성 규칙만 추가한다', () => {
    expect(postsSchema.posts).toBeDefined();
    expect(postsSchema.postLikes).toBeDefined();

    if (postsSchema.posts === undefined || postsSchema.postLikes === undefined) {
      return;
    }

    expect(
      uniqueConstraintNames(postsSchema.posts as unknown as Parameters<typeof getTableConfig>[0]),
    ).toContain('uq_post_daily_jogak');
    expect(
      uniqueConstraintNames(
        postsSchema.postLikes as unknown as Parameters<typeof getTableConfig>[0],
      ),
    ).toContain('uq_post_like_post_user');
  });

  it('삭제된 조각의 게시글을 보존하도록 실행 기록 외래키를 만들지 않는다', () => {
    expect(postsSchema.posts).toBeDefined();
    if (postsSchema.posts === undefined) return;

    const foreignKeyColumns = getTableConfig(
      postsSchema.posts as unknown as Parameters<typeof getTableConfig>[0],
    ).foreignKeys.flatMap((foreignKey) =>
      foreignKey.reference().columns.map((column) => column.name),
    );
    expect(foreignKeyColumns).not.toContain('daily_jogak_id');
  });
});
