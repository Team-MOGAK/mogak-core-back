import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './index';

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

describe('mogaks schema', () => {
  it('uses relational bigint IDs for categories, schedule weekdays, and executions', () => {
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

  it('adds only the category and occurrence uniqueness rules required for correctness', () => {
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
    ).toContain('jogak_executions_jogak_scheduled_date_unique');
  });
});
