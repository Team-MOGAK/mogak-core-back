import { testMock } from '../../testMock';

import type { Database } from '../../../src/database/database.provider';
import { PostsPersistenceException } from '../../../src/posts/domain/exception/postsPersistence.exception';
import { PostsRepository } from '../../../src/posts/infrastructure/repository/posts.repository';

describe('게시글 저장소', () => {
  it('댓글 삽입 결과가 없으면 PostsPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const repository = new PostsRepository({ insert } as unknown as Database);

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostsPersistenceException);
  });

  it('생성한 댓글을 재조회하지 못하면 PostsPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([{ id: 3 }]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const where = testMock().mockResolvedValue([]);
    const leftJoin = testMock().mockReturnValue({ where });
    const innerJoin = testMock().mockReturnValue({ leftJoin });
    const from = testMock().mockReturnValue({ innerJoin });
    const select = testMock().mockReturnValue({ from });
    const repository = new PostsRepository({ insert, select } as unknown as Database);

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostsPersistenceException);
  });
});
