import { getTableConfig } from 'drizzle-orm/pg-core';

import * as schema from '../../../src/database/schema/index';

type Column = Readonly<{ dataType: string; notNull: boolean }>;
type MogaksSchema = Readonly<{
  mogakCategories: Readonly<{ id: Column; code: Column }>;
  jogakScheduleWeekdays: Readonly<{ scheduleId: Column }>;
  jogakExecutions: Readonly<{ jogakId: Column; scheduledDate: Column }>;
}>;

const mogaks = schema as Partial<MogaksSchema>;

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .uniqueConstraints.map((constraint) => constraint.getName())
    .filter((name): name is string => name !== undefined);
}

describe('모각 데이터베이스 스키마', () => {
  it('카테고리와 일정 요일과 실행에 관계형 bigint 식별자를 사용한다', () => {
    expect(mogaks.mogakCategories).toBeDefined();
    expect(mogaks.jogakScheduleWeekdays).toBeDefined();
    expect(mogaks.jogakExecutions).toBeDefined();

    if (
      mogaks.mogakCategories === undefined ||
      mogaks.jogakScheduleWeekdays === undefined ||
      mogaks.jogakExecutions === undefined
    ) {
      return;
    }

    expect(mogaks.mogakCategories.id.dataType).toBe('number');
    expect(mogaks.mogakCategories.code.notNull).toBe(true);
    expect(mogaks.jogakScheduleWeekdays.scheduleId.notNull).toBe(true);
    expect(mogaks.jogakExecutions.jogakId.dataType).toBe('number');
    expect(mogaks.jogakExecutions.scheduledDate.notNull).toBe(true);
  });

  it('정합성에 필요한 카테고리와 실행 발생 고유성 규칙만 추가한다', () => {
    expect(mogaks.mogakCategories).toBeDefined();
    expect(mogaks.jogakScheduleWeekdays).toBeDefined();
    expect(mogaks.jogakExecutions).toBeDefined();

    if (
      mogaks.mogakCategories === undefined ||
      mogaks.jogakScheduleWeekdays === undefined ||
      mogaks.jogakExecutions === undefined
    ) {
      return;
    }

    expect(
      uniqueConstraintNames(
        mogaks.mogakCategories as unknown as Parameters<typeof getTableConfig>[0],
      ),
    ).toContain('mogak_categories_code_unique');
    expect(
      uniqueConstraintNames(
        mogaks.jogakScheduleWeekdays as unknown as Parameters<typeof getTableConfig>[0],
      ),
    ).toContain('jogak_schedule_weekdays_schedule_weekday_unique');
    expect(
      uniqueConstraintNames(
        mogaks.jogakExecutions as unknown as Parameters<typeof getTableConfig>[0],
      ),
    ).toContain('uq_daily_jogak_jogak_target');
  });
});
