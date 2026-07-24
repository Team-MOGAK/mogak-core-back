import assert from 'node:assert/strict';

export async function runLocalApiScenario({
  baseUrl,
  accessToken,
  targetNickname,
  date,
  onStep = () => {},
}) {
  await requestHealth(baseUrl, onStep);

  const request = createAuthenticatedRequest(baseUrl, accessToken, onStep);
  await request('모각 카테고리 조회', 'GET', '/api/metadata/mogak-categories');
  await request('내 프로필 조회', 'GET', '/api/users/profile');

  const createdModarat = await request('모다랏 생성', 'POST', '/api/modarats', {
    expectedStatus: 201,
    json: { title: '로컬 검증 모다랏', color: '#5B8DEF' },
  });
  const modaratId = positiveId(createdModarat.id);
  await request('모다랏 목록 조회', 'GET', '/api/modarats');
  await request('모다랏 수정', 'PUT', `/api/modarats/${modaratId}`, {
    json: { title: '수정된 로컬 검증 모다랏', color: '#5B8DEF' },
  });

  const mogak = await request('모각 생성', 'POST', '/api/mogaks', {
    expectedStatus: 201,
    json: {
      modaratId,
      title: '로컬 검증 모각',
      customCategoryName: '개발',
      color: '#5B8DEF',
    },
  });
  const mogakId = positiveId(mogak.id);
  await request('모다랏의 모각 조회', 'GET', `/api/modarats/${modaratId}/mogaks`);

  const jogak = await request('조각 생성', 'POST', '/api/jogaks', {
    expectedStatus: 201,
    json: {
      mogakId,
      title: '로컬 검증 조각',
      schedule: { scheduleType: 'ONCE', effectiveFrom: date },
    },
  });
  const jogakId = positiveId(jogak.jogakId);
  await request('날짜별 조각 조회', 'GET', `/api/jogaks?date=${encodeURIComponent(date)}`);
  await request('조각 실행 시작', 'POST', `/api/jogaks/${jogakId}/executions/${date}/start`, {
    expectedStatus: 201,
  });
  await request('조각 실행 완료', 'POST', `/api/jogaks/${jogakId}/executions/${date}/success`);

  const post = await request('게시글 생성', 'POST', `/api/jogaks/${jogakId}/posts`, {
    form: { request: JSON.stringify({ targetDate: date, contents: '로컬 검증 게시글' }) },
  });
  const postId = positiveId(post.id);
  await request('게시글 상세 조회', 'GET', `/api/posts/${postId}`);
  await request('게시글 수정', 'PUT', `/api/posts/${postId}`, {
    json: { contents: '수정된 로컬 검증 게시글' },
  });

  const comment = await request('댓글 생성', 'POST', `/api/posts/${postId}/comments`, {
    json: { contents: '로컬 검증 댓글' },
  });
  const commentId = positiveId(comment.id);
  await request('댓글 목록 조회', 'GET', `/api/posts/${postId}/comments`);
  await request('댓글 수정', 'PUT', `/api/posts/${postId}/comments/${commentId}`, {
    json: { contents: '수정된 로컬 검증 댓글' },
  });
  await request('게시글 좋아요 생성', 'POST', '/api/posts/like', { json: { postId } });
  await request('게시글 좋아요 취소', 'POST', '/api/posts/like', { json: { postId } });

  const encodedNickname = encodeURIComponent(targetNickname);
  await request('팔로우 생성', 'POST', `/api/users/follows/${encodedNickname}`);
  const followCounts = await request(
    '팔로우 수 조회',
    'GET',
    `/api/users/follows/counts/${encodedNickname}`,
  );
  assert.equal(followCounts.mentorCnt, 0, '팔로우 생성 후 mentorCnt는 0이어야 합니다.');
  assert.equal(followCounts.motoCnt, 1, '팔로우 생성 후 motoCnt는 1이어야 합니다.');
  await request('팔로우 취소', 'DELETE', `/api/users/follows/${encodedNickname}`);
}

async function requestHealth(baseUrl, onStep) {
  const response = await globalThis.fetch(`${baseUrl}/health`);
  const body = await response.json();
  if (response.status !== 200 || body.status !== 'ok') {
    throw new Error(`헬스체크 검증 실패: ${response.status} ${JSON.stringify(body)}`);
  }
  onStep('헬스체크');
}

function createAuthenticatedRequest(baseUrl, accessToken, onStep) {
  return async (name, method, path, options = {}) => {
    const response = await globalThis.fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...headersFor(options),
      },
      body: requestBody(options),
    });
    const body = await responseJson(response, name, method, path);
    const expectedStatus = options.expectedStatus ?? 200;
    if (response.status !== expectedStatus) {
      throw new Error(
        `${name} 검증 실패 (${method} ${path}): 예상 ${expectedStatus}, 실제 ${response.status}; ${JSON.stringify(body)}`,
      );
    }
    if (body.result === undefined) {
      throw new Error(`${name} 검증 실패 (${method} ${path}): 성공 응답 result가 없습니다.`);
    }
    onStep(name);
    return body.result;
  };
}

function headersFor(options) {
  if (options.json !== undefined) return { 'content-type': 'application/json' };
  return {};
}

function requestBody(options) {
  if (options.json !== undefined) return JSON.stringify(options.json);
  if (options.form === undefined) return undefined;
  const form = new globalThis.FormData();
  for (const [key, value] of Object.entries(options.form)) form.set(key, value);
  return form;
}

async function responseJson(response, name, method, path) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${name} 검증 실패 (${method} ${path}): JSON 응답이 아닙니다.`);
  }
}

function positiveId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`생성 응답에 유효한 ID가 없습니다: ${String(value)}`);
  }
  return value;
}
