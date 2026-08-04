import type { HasRuntimeDefault, IsPrimaryKey } from 'drizzle-orm/column-builder';
import { type PgUUIDBuilderInitial, uuid } from 'drizzle-orm/pg-core';

import { generateId } from '../../common/util/idGenerator';

type UuidPrimaryKey<TName extends string> = HasRuntimeDefault<
  IsPrimaryKey<PgUUIDBuilderInitial<TName>>
>;

export const baseUuidPrimaryKey = <TName extends string = 'id'>(
  name?: TName,
): UuidPrimaryKey<TName> =>
  uuid((name ?? 'id') as TName)
    .primaryKey()
    .$defaultFn(() => generateId());
