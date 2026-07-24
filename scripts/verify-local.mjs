import { spawn } from 'node:child_process';
import console from 'node:console';
import { once } from 'node:events';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { createLocalApiFixture } from './local-api-fixture.mjs';
import { runLocalApiScenario } from './local-api-scenario.mjs';

const localDefaults = {
  DATABASE_URL: 'postgresql://mogak:mogak@127.0.0.1:5436/mogak_local',
  JWT_SECRET: 'local-development-secret-must-be-at-least-32-characters',
  APPLE_CLIENT_IDS: 'local-apple-client-id',
  GOOGLE_CLIENT_IDS: 'local-google-client-id',
};

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const plan = [
  ['docker', ['compose', 'up', '-d', '--wait', 'postgres']],
  [pnpm, ['format:check']],
  [pnpm, ['lint']],
  [pnpm, ['typecheck']],
  [pnpm, ['build']],
  [pnpm, ['db:migrate'], 'mogak_test'],
  [pnpm, ['test', '--runInBand']],
  [pnpm, ['test:e2e', '--runInBand']],
  [pnpm, ['test:db', '--runInBand']],
  ['node', ['dist/main.js']],
  ['node', ['scripts/local-api-scenario.mjs']],
];

if (process.argv.includes('--dry-run')) {
  for (const [command, args, databaseName] of plan) {
    console.log(
      `${[command, ...args].join(' ')}${databaseName === undefined ? '' : ` (${databaseName})`}`,
    );
  }
  process.exit(0);
}

loadEnv({ path: '.env', quiet: true });
const environment = { ...localDefaults, ...process.env };
const testEnvironment = {
  ...environment,
  DATABASE_URL: withDatabaseName(environment.DATABASE_URL, 'mogak_test'),
};

await run('docker', ['compose', 'up', '-d', '--wait', 'postgres'], environment);
await run(pnpm, ['format:check'], environment);
await run(pnpm, ['lint'], environment);
await run(pnpm, ['typecheck'], environment);
await run(pnpm, ['build'], environment);
await run(pnpm, ['db:migrate'], testEnvironment);
await run(pnpm, ['test', '--runInBand'], testEnvironment);
await run(pnpm, ['test:e2e', '--runInBand'], testEnvironment);
await run(pnpm, ['test:db', '--runInBand'], testEnvironment);
await verifyApiScenario(testEnvironment);

function withDatabaseName(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function run(command, args, env) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  const [exitCode] = await once(child, 'exit');
  if (exitCode !== 0) {
    throw new Error(`${[command, ...args].join(' ')} failed with exit code ${exitCode}`);
  }
}

async function verifyApiScenario(env) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let fixture;
  let failure;
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  console.log(`\n$ node dist/main.js (PORT=${port}, DATABASE_URL=mogak_test)`);
  try {
    await waitForHealth(child, port, () => output);
    fixture = await createLocalApiFixture({
      databaseUrl: env.DATABASE_URL,
      jwtSecret: env.JWT_SECRET,
    });
    await runLocalApiScenario({
      baseUrl: `http://127.0.0.1:${port}`,
      accessToken: fixture.accessToken,
      targetNickname: fixture.targetNickname,
      date: kstToday(),
      onStep: (name) => console.log(`  ✓ ${name}`),
    });
    console.log('local API scenario passed');
  } catch (error) {
    failure = error;
  }

  const cleanupErrors = [];
  if (fixture !== undefined) {
    try {
      await fixture.cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await stop(child);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (failure !== undefined) {
    for (const error of cleanupErrors) console.error(`cleanup failed: ${String(error)}`);
    throw failure;
  }
  if (cleanupErrors.length > 0) {
    throw new Error(`로컬 API 검증 정리에 실패했습니다: ${cleanupErrors.map(String).join('\n')}`);
  }
}

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('could not reserve a local port');
  }
  const { port } = address;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForHealth(child, port, output) {
  const deadline = Date.now() + 15_000;
  let lastError = 'API did not become ready';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before health check:\n${output()}`);
    }
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json();
      if (response.status === 200 && body.status === 'ok') return;
      lastError = `unexpected health response: ${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  throw new Error(`health check timed out: ${lastError}\n${output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([once(child, 'exit'), delay(3_000)]);
  if (exited === undefined && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function kstToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
