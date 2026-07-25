import {
  isCommentAuthor,
  validateCommentContents,
  validatePostContents,
} from '../../../../src/posts/domain/entity/post.entity';

describe('게시글 도메인 규칙', () => {
  it('게시글과 댓글 내용을 정규화하고 각각의 최대 길이를 적용한다', () => {
    expect(validatePostContents('  오늘 회고  ')).toEqual({ valid: true, value: '오늘 회고' });
    expect(validateCommentContents('  응원합니다  ')).toEqual({ valid: true, value: '응원합니다' });
    expect(validatePostContents('x'.repeat(351))).toEqual({ valid: false, reason: 'TOO_LONG' });
    expect(validateCommentContents('x'.repeat(201))).toEqual({ valid: false, reason: 'TOO_LONG' });
  });

  it('댓글 작성자만 댓글을 소유한다', () => {
    expect(isCommentAuthor({ authorId: 7 }, 7)).toBe(true);
    expect(isCommentAuthor({ authorId: 7 }, 8)).toBe(false);
  });
});
