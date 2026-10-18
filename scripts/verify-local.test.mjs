import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';

test('로컬 검증 계획은 PostgreSQL 준비부터 인증된 실제 API 시나리오까지 포함한다', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-local.mjs', '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /docker compose up -d --wait postgres/);
  assert.match(result.stdout, /pnpm format:check/);
  assert.match(result.stdout, /pnpm db:migrate \(mogak_test\)/);
  assert.match(result.stdout, /pnpm test:e2e --runInBand/);
  assert.match(result.stdout, /pnpm test:integration --runInBand/);
  assert.match(result.stdout, /node dist\/main\.js/);
  assert.match(result.stdout, /node scripts\/local-api-scenario\.mjs/);
});
