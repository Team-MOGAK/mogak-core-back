import {
  MAX_MOGAKS_PER_MODARAT,
  selectMogakCategory,
  validateMogakCapacity,
} from '../../../../src/mogaks/domain/entity/mogak.entity';

describe('모각 도메인 규칙', () => {
  it('모다랏에는 여덟 개까지만 모각을 둘 수 있다', () => {
    expect(validateMogakCapacity(MAX_MOGAKS_PER_MODARAT - 1)).toBe(true);
    expect(validateMogakCapacity(MAX_MOGAKS_PER_MODARAT)).toBe(false);
  });

  it('공식 카테고리와 사용자 카테고리를 동시에 선택할 수 없다', () => {
    expect(() =>
      selectMogakCategory({ categoryCode: 'CERTIFICATION', customCategoryName: '코딩 테스트' }),
    ).toThrow('exactly one category');
  });

  it('한 가지 카테고리 선택을 영속화 가능한 모양으로 정규화한다', () => {
    expect(selectMogakCategory({ categoryCode: 'CERTIFICATION' })).toEqual({
      type: 'OFFICIAL',
      code: 'CERTIFICATION',
    });
    expect(selectMogakCategory({ customCategoryName: '코딩 테스트' })).toEqual({
      type: 'CUSTOM',
      name: '코딩 테스트',
    });
  });
});
