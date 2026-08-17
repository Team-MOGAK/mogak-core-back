import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@api/common/http/appErrorCode';

describe('애플리케이션 오류 코드', () => {
  it('기존 소셜 계정 연결 필요 오류 계약을 유지한다', () => {
    expect(AppErrorCode.SOCIAL_ACCOUNT_LINK_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'U012',
      message: '기존 계정에 소셜 계정 연결이 필요합니다',
    });
  });

  it('기존 로그아웃 토큰 오류 계약을 유지한다', () => {
    expect(AppErrorCode.LOGOUT_TOKEN).toMatchObject({
      httpStatus: HttpStatus.FORBIDDEN,
      code: 'T005',
      message: '로그아웃된 토큰입니다',
    });
  });

  it('가상 실행에 필요한 공개 모각과 조각 오류 계약을 유지한다', () => {
    const codes = AppErrorCode as Record<string, unknown>;

    expect(codes.MODARAT_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'A001',
      message: '존재하지 않는 모다라트입니다',
    });
    expect(codes.MOGAK_CATEGORY_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'M001',
      message: '존재하지 않는 카테고리입니다',
    });
    expect(codes.CUSTOM_CATEGORY_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'M002',
      message: '기타 카테고리가 존재하지 않습니다',
    });
    expect(codes.MOGAK_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'M004',
      message: '존재하지 않는 모각입니다',
    });
    expect(codes.JOGAK_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'J005',
      message: '존재하지 않는 조각입니다',
    });
    expect(codes.INVALID_SCHEDULE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J009',
      message: '유효하지 않은 반복주기입니다',
    });
    expect(codes.INVALID_OCCURRENCE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J010',
      message: '유효하지 않은 루틴의 조각입니다',
    });
    expect(codes.MAX_MOGAKS).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'J012',
      message: '생성 가능한 모각의 최대 갯수는 8개 입니다',
    });
    expect(codes.ROUTINE_WEEKDAYS_REQUIRED).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'J013',
      message: '루틴이 설정된 경우 요일이 필요합니다',
    });
    expect(codes.INVALID_TARGET_DATE).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'J017',
      message: '유효하지 않은 실천 날짜입니다',
    });
    expect(codes.INVALID_EXECUTION_TRANSITION).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'M003',
      message: '잘못된 상태 변경입니다',
    });
  });

  it('공개 게시글과 댓글 오류 계약을 유지한다', () => {
    const codes = AppErrorCode as Record<string, unknown>;

    expect(codes.POST_CONTENTS_TOO_LONG).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'P001',
      message: '최대 글자수 350자를 초과하였습니다',
    });
    expect(codes.POST_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'P003',
      message: '존재하지 않는 게시물입니다',
    });
    expect(codes.POST_ALREADY_EXISTS).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'P005',
      message: '이미 존재하는 회고록입니다',
    });
    expect(codes.COMMENT_CONTENTS_TOO_LONG).toMatchObject({
      httpStatus: HttpStatus.BAD_REQUEST,
      code: 'C001',
      message: '최대 글자수 200자를 초과하였습니다',
    });
    expect(codes.COMMENT_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'C002',
      message: '존재하지 않는 댓글입니다',
    });
  });

  it('공개 팔로우 오류 계약을 유지한다', () => {
    const codes = AppErrorCode as Record<string, unknown>;

    expect(codes.FOLLOW_ALREADY_EXISTS).toMatchObject({
      httpStatus: HttpStatus.CONFLICT,
      code: 'F001',
      message: '이미 존재하는 팔로우입니다',
    });
    expect(codes.FOLLOW_NOT_FOUND).toMatchObject({
      httpStatus: HttpStatus.NOT_FOUND,
      code: 'F002',
      message: '존재하지 않는 팔로우입니다',
    });
  });
});
