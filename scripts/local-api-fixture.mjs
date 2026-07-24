import { createHash, randomUUID } from 'node:crypto';
import { TextEncoder } from 'node:util';

import { SignJWT } from 'jose';
import { Pool } from 'pg';

export async function createLocalApiFixture({
  databaseUrl,
  jwtSecret,
  poolFactory = (options) => new Pool(options),
  randomId = randomUUID,
}) {
  const pool = poolFactory({ connectionString: databaseUrl });
  const suffix = randomId().replaceAll('-', '');
  const userIds = [];

  try {
    const ownerId = await createUser(
      pool,
      `local-api-owner-${suffix}`,
      `local-api-owner-${suffix}`,
    );
    userIds.push(ownerId);
    const targetNickname = `local-api-target-${suffix.slice(0, 12)}`;
    const targetId = await createUser(pool, `local-api-target-${suffix}`, targetNickname);
    userIds.push(targetId);

    const sessionId = randomId();
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        sessionId,
        ownerId,
        createHash('sha256').update(`local-api-fixture:${suffix}`).digest('hex'),
        new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      ],
    );

    const accessToken = await new SignJWT({
      id: ownerId,
      role: 'USER',
      token_type: 'access',
      sid: sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(ownerId))
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(jwtSecret));

    let cleaned = false;
    return {
      accessToken,
      targetNickname,
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        try {
          await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
        } finally {
          await pool.end();
        }
      },
    };
  } catch (error) {
    try {
      if (userIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
      }
    } finally {
      await pool.end();
    }
    throw error;
  }
}

async function createUser(pool, emailPrefix, nickname) {
  const result = await pool.query(
    `INSERT INTO users (email, nickname, role)
     VALUES ($1, $2, 'USER')
     RETURNING id`,
    [`${emailPrefix}@mogak.test`, nickname],
  );
  const id = Number(result.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('로컬 API 검증 사용자 생성 결과에 유효한 ID가 없습니다.');
  }
  return id;
}
