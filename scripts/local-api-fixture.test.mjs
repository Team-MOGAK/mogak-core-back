import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';
import test from 'node:test';

import { jwtVerify } from 'jose';

import { createLocalApiFixture } from './local-api-fixture.mjs';

test('로컬 API 검증용 사용자와 활성 세션만 만들고 사용자 삭제로 정리한다', async () => {
  const calls = [];
  let ended = false;
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [{ id: calls.filter((call) => call.sql.includes('INSERT INTO users')).length }],
        };
      }
      return { rows: [] };
    },
    async end() {
      ended = true;
    },
  };

  const secret = 'local-api-fixture-secret-must-be-at-least-32-characters';
  const fixture = await createLocalApiFixture({
    databaseUrl: 'postgresql://mogak:mogak@127.0.0.1:5436/mogak_test',
    jwtSecret: secret,
    poolFactory: () => pool,
    randomId: () => '01234567-89ab-4cde-8fab-0123456789ab',
  });

  assert.equal(fixture.targetNickname, 'local-api-target-0123456789ab');
  const { payload } = await jwtVerify(fixture.accessToken, new TextEncoder().encode(secret));
  assert.equal(payload.sub, '1');
  assert.equal(payload.id, 1);
  assert.equal(payload.role, 'USER');
  assert.equal(payload.token_type, 'access');
  assert.equal(typeof payload.sid, 'string');
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO users')).length, 2);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO auth_sessions')).length, 1);

  await fixture.cleanup();
  await fixture.cleanup();

  const deleteCalls = calls.filter((call) => call.sql.includes('DELETE FROM users'));
  assert.equal(deleteCalls.length, 1);
  assert.deepEqual(deleteCalls[0].values, [[1, 2]]);
  assert.equal(ended, true);
});
