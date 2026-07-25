import { AppErrorCode } from '../../../../src/common/http/app-error-code';
import { DomainException } from '../../../../src/common/http/domain.exception';
import {
  isCommentAuthor,
  normalizeCommentContents,
  normalizePostContents,
} from '../../../../src/posts/domain/entity/post.entity';

describe('게시글 도메인 규칙', () => {
  it('게시글과 댓글 내용을 정규화하고 각각의 최대 길이를 적용한다', () => {
    expect(normalizePostContents('  오늘 회고  ')).toBe('오늘 회고');
    expect(normalizeCommentContents('  응원합니다  ')).toBe('응원합니다');
    expect(() => normalizePostContents('x'.repeat(351))).toThrow(
      new DomainException(AppErrorCode.POST_CONTENTS_TOO_LONG),
    );
    expect(() => normalizeCommentContents('x'.repeat(201))).toThrow(
      new DomainException(AppErrorCode.COMMENT_CONTENTS_TOO_LONG),
    );
  });

  it('댓글 작성자만 댓글을 소유한다', () => {
    expect(isCommentAuthor({ authorId: 7 }, 7)).toBe(true);
    expect(isCommentAuthor({ authorId: 7 }, 8)).toBe(false);
  });
});
