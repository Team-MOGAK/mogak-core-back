import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { lockUsersForTransaction } from '@infra/database/transaction/userAdvisoryLock';

describe('사용자 transaction advisory lock', () => {
  it('중복을 제거한 사용자 ID를 오름차순으로 transaction lock 한다', async () => {
    const queries: SQL[] = [];
    const execute = async (query: SQL): Promise<void> => {
      queries.push(query);
    };

    await lockUsersForTransaction({ execute }, [9, 2, 9, 4]);

    const dialect = new PgDialect();
    expect(queries.map((query) => dialect.sqlToQuery(query).params)).toEqual([[2], [4], [9]]);
  });
});
