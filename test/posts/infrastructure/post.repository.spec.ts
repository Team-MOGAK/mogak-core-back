import { testMock } from '../../testMock';
import { pinoLoggerStub } from '../../fixtures/pinoLogger.fixture';

import type { Database } from '@infra/database/database.provider';
import { PostPersistenceException } from '@core/posts/domain/exception/postPersistence.exception';
import { PostRepository } from '@infra/posts/repository/post.repository';

describe('게시글 저장소', () => {
  it('댓글 삽입 결과가 없으면 PostPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const select = selectSequence([
      [{ authorId: 2, hierarchyOwnerId: null }],
      [{ authorId: 2, hierarchyOwnerId: null }],
      [{ id: 2 }],
    ]);
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), select, insert }),
    );
    const repository = new PostRepository({ transaction } as unknown as Database, pinoLoggerStub());

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostPersistenceException);
  });

  it('생성한 댓글을 재조회하지 못하면 PostPersistenceException을 던진다', async () => {
    const returning = testMock().mockResolvedValue([{ id: 3 }]);
    const values = testMock().mockReturnValue({ returning });
    const insert = testMock().mockReturnValue({ values });
    const select = selectSequence([[{ id: 2 }], [{ id: 2 }], []]);
    const transaction = testMock().mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ execute: testMock(), select, insert }),
    );
    const repository = new PostRepository({ transaction } as unknown as Database, pinoLoggerStub());

    await expect(
      repository.createComment({ postId: 1, authorId: 2, contents: '댓글' }),
    ).rejects.toBeInstanceOf(PostPersistenceException);
  });
});

function selectSequence(results: readonly unknown[]) {
  let index = 0;
  return testMock().mockImplementation(() => {
    const query = {
      from: testMock(),
      leftJoin: testMock(),
      innerJoin: testMock(),
      where: testMock(),
    };
    query.from.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockImplementation(() => Promise.resolve(results[index++]));
    return query;
  });
}
