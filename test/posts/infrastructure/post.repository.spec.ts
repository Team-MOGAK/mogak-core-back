import { testMock } from '../../testMock';

import type { Database } from '../../../src/database/database.provider';
import { PostPersistenceException } from '../../../src/posts/domain/exception/postPersistence.exception';
import { PostRepository } from '../../../src/posts/infrastructure/repository/post.repository';

describe('게시글 저장소', () => {
  it('댓글 삽입 결과가 없으면 PostPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const repository = new PostRepository({ insert } as unknown as Database);

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostPersistenceException);
  });

  it('생성한 댓글을 재조회하지 못하면 PostPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([{ id: 3 }]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const where = testMock().mockResolvedValue([]);
    const leftJoin = testMock().mockReturnValue({ where });
    const innerJoin = testMock().mockReturnValue({ leftJoin });
    const from = testMock().mockReturnValue({ innerJoin });
    const select = testMock().mockReturnValue({ from });
    const repository = new PostRepository({ insert, select } as unknown as Database);

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostPersistenceException);
  });
});
