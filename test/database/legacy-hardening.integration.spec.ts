import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';

const run = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Legacy migration tests require a database ending in _test');
}

describe('Spring 호환 migration 실제 CLI', () => {
  let client: Client;
  let schema: string;
  let isolatedUrl: string;

  beforeEach(async () => {
    schema = 'legacy_' + randomUUID().replaceAll('-', '');
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(await readFile('test/database/fixtures/legacy-hardening.sql', 'utf8'));
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    isolatedUrl = url.toString();
  });

  afterEach(async () => {
    try {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  });

  async function migrate(args: string[] = []) {
    try {
      const result = await run(
        process.execPath,
        ['scripts/migrateLegacySchemaCompatibility.mjs', ...args],
        {
          env: { ...process.env, DATABASE_URL: isolatedUrl },
          timeout: 15_000,
        },
      );
      return { code: 0, ...result };
    } catch (error) {
      const result = error as { code: number; stdout: string; stderr: string };
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    }
  }

  async function weekdays() {
    return (await client.query('SELECT weekday FROM jogak_schedule_weekdays ORDER BY weekday'))
      .rows;
  }

  it('모든 원본 요일을 보존하고 재실행해도 행을 늘리지 않는다', async () => {
    expect((await migrate()).code).toBe(0);
    expect(await weekdays()).toEqual([{ weekday: 'MONDAY' }, { weekday: 'WEDNESDAY' }]);
    expect((await migrate()).code).toBe(0);
    expect((await client.query('SELECT count(*)::int AS count FROM jogak_schedules')).rows).toEqual(
      [{ count: 2 }],
    );
    expect(await weekdays()).toHaveLength(2);
  });

  it('충돌 ID와 양쪽 집합을 출력하고 기존 요일과 신규 백필 전체를 보존한다', async () => {
    expect((await migrate()).code).toBe(0);
    await client.query("DELETE FROM jogak_schedule_weekdays WHERE weekday = 'WEDNESDAY'");
    await client.query("INSERT INTO jogak VALUES (102, 10, false, DATE '2026-09-09', NULL)");
    const result = await migrate();
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('jogak_id=100');
    expect(result.stderr).toContain('source_weekdays={MONDAY,WEDNESDAY}');
    expect(result.stderr).toContain('target_weekdays={MONDAY}');
    expect(await weekdays()).toEqual([{ weekday: 'MONDAY' }]);
    expect((await client.query('SELECT * FROM jogak_schedules WHERE jogak_id = 102')).rows).toEqual(
      [],
    );
    expect((await migrate(['--repair-weekdays', '100'])).code).not.toBe(0);
    expect(await weekdays()).toEqual([{ weekday: 'MONDAY' }]);
  });

  it.each([
    ['UPDATE jogak SET is_routine = NULL WHERE jogak_id = 100', 'must not be NULL'],
    ["UPDATE period SET days = ' WEDNESDAY ' WHERE period_id = 2", 'unsupported weekday'],
    ['DELETE FROM period WHERE period_id = 2', 'orphan period_id'],
  ])('유효하지 않은 원본은 schema 변경 전에 거부한다: %s', async (sql, message) => {
    await client.query(sql);
    const result = await migrate();
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect((await client.query("SELECT to_regclass('jogak_schedules') AS relation")).rows).toEqual([
      { relation: null },
    ]);
  });
});
