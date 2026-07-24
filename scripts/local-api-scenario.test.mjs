import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { URL } from 'node:url';

import { runLocalApiScenario } from './local-api-scenario.mjs';

test('실행 중인 API에 인증 헤더와 요청 바디를 넣어 핵심 사용자 흐름을 순서대로 검증한다', async () => {
  const received = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const body = await readBody(request);
    received.push({
      method: request.method,
      pathname: url.pathname,
      search: url.search,
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
      body,
    });
    const result = resultFor(request.method, url.pathname);
    response.writeHead(result.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  try {
    await runLocalApiScenario({
      baseUrl: `http://127.0.0.1:${address.port}`,
      accessToken: 'fixture-access-token',
      targetNickname: 'fixture-target',
      date: '2026-07-24',
    });
  } finally {
    server.close();
    await once(server, 'close');
  }

  assert.deepEqual(
    received.map(({ method, pathname, search }) => [method, `${pathname}${search}`]),
    [
      ['GET', '/health'],
      ['GET', '/api/metadata/mogak-categories'],
      ['GET', '/api/users/profile'],
      ['POST', '/api/modarats'],
      ['GET', '/api/modarats'],
      ['PUT', '/api/modarats/101'],
      ['POST', '/api/mogaks'],
      ['GET', '/api/modarats/101/mogaks'],
      ['POST', '/api/jogaks'],
      ['GET', '/api/jogaks?date=2026-07-24'],
      ['POST', '/api/jogaks/301/executions/2026-07-24/start'],
      ['POST', '/api/jogaks/301/executions/2026-07-24/success'],
      ['POST', '/api/jogaks/301/posts'],
      ['GET', '/api/posts/401'],
      ['PUT', '/api/posts/401'],
      ['POST', '/api/posts/401/comments'],
      ['GET', '/api/posts/401/comments'],
      ['PUT', '/api/posts/401/comments/501'],
      ['POST', '/api/posts/like'],
      ['POST', '/api/posts/like'],
      ['POST', '/api/users/follows/fixture-target'],
      ['GET', '/api/users/follows/counts/fixture-target'],
      ['DELETE', '/api/users/follows/fixture-target'],
    ],
  );
  assert.equal(received[0].authorization, undefined);
  for (const request of received.slice(1)) {
    assert.equal(request.authorization, 'Bearer fixture-access-token');
  }
  assert.deepEqual(JSON.parse(required(received[3]).body), {
    title: '로컬 검증 모다랏',
    color: '#5B8DEF',
  });
  assert.deepEqual(JSON.parse(required(received[6]).body), {
    modaratId: 101,
    title: '로컬 검증 모각',
    customCategoryName: '개발',
    color: '#5B8DEF',
  });
  assert.deepEqual(JSON.parse(required(received[8]).body), {
    mogakId: 201,
    title: '로컬 검증 조각',
    schedule: { scheduleType: 'ONCE', effectiveFrom: '2026-07-24' },
  });
  assert.match(required(received[12]).contentType, /^multipart\/form-data; boundary=/);
  assert.match(required(received[12]).body, /"targetDate":"2026-07-24"/);
  assert.match(required(received[12]).body, /"contents":"로컬 검증 게시글"/);
  assert.deepEqual(JSON.parse(required(received[14]).body), {
    contents: '수정된 로컬 검증 게시글',
  });
  assert.deepEqual(JSON.parse(required(received[15]).body), { contents: '로컬 검증 댓글' });
  assert.deepEqual(JSON.parse(required(received[17]).body), { contents: '수정된 로컬 검증 댓글' });
  assert.deepEqual(JSON.parse(required(received[18]).body), { postId: 401 });
});

function resultFor(method, pathname) {
  if (method === 'GET' && pathname === '/health') return { status: 200, body: { status: 'ok' } };
  if (method === 'POST' && pathname === '/api/modarats') return success(201, { id: 101 });
  if (method === 'POST' && pathname === '/api/mogaks') return success(201, { id: 201 });
  if (method === 'POST' && pathname === '/api/jogaks') return success(201, { jogakId: 301 });
  if (method === 'POST' && pathname === '/api/jogaks/301/executions/2026-07-24/start') {
    return success(201, {});
  }
  if (method === 'POST' && pathname === '/api/jogaks/301/posts') return success(200, { id: 401 });
  if (method === 'POST' && pathname === '/api/posts/401/comments') return success(200, { id: 501 });
  if (method === 'GET' && pathname === '/api/users/follows/counts/fixture-target') {
    return success(200, { mentorCnt: 0, motoCnt: 1 });
  }
  return success(200, {});
}

function success(status, result) {
  return { status, body: { status: status === 201 ? 'CREATED' : 'OK', result } };
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body;
}

function required(value) {
  assert.notEqual(value, undefined);
  return value;
}
