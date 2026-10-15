import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  assertChannelState,
  buildChannelPlan,
  canRotateSecret,
  initializeChannel,
  initialState,
  loadChannelConfig,
  transactChannel,
  updateState,
} from './channel.mjs';

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(DIRECTORY, 'config.example.json');

function fakeFirestore() {
  let data;
  const reference = { path: 'alertChannels/production-discord' };
  return {
    doc() {
      return reference;
    },
    async runTransaction(callback) {
      const transaction = {
        async get() {
          return {
            exists: data !== undefined,
            data: () => data,
          };
        },
        create(_reference, value) {
          if (data !== undefined) throw new Error('already exists');
          data = { ...value };
        },
        update(_reference, value) {
          data = { ...value };
        },
      };
      return callback(transaction);
    },
    read() {
      return data;
    },
  };
}

test('initial channel state has only the six transactional fields and starts disabled', () => {
  const state = initialState('1');
  assert.deepEqual(state, {
    schemaVersion: 1,
    secretVersion: 1,
    disabled: true,
    nextAllowedAt: 0,
    leaseToken: null,
    leaseExpiresAt: 0,
  });
  assert.doesNotThrow(() => assertChannelState(state));
});

test('resume, disable, and cooldown clear preserve lease ownership fields', () => {
  const state = {
    ...initialState('1'),
    disabled: false,
    nextAllowedAt: 123,
    leaseToken: '550e8400-e29b-41d4-a716-446655440000',
    leaseExpiresAt: 500,
  };
  assert.equal(updateState(state, 'disable').disabled, true);
  assert.equal(updateState(state, 'resume').disabled, false);
  const cleared = updateState(state, 'cooldown-clear');
  assert.equal(cleared.nextAllowedAt, 0);
  assert.equal(cleared.leaseToken, state.leaseToken);
  assert.equal(cleared.leaseExpiresAt, state.leaseExpiresAt);
});

test('secret rotation is fenced by an active lease and clears an expired lease', () => {
  const active = {
    ...initialState('1'),
    leaseToken: '550e8400-e29b-41d4-a716-446655440000',
    leaseExpiresAt: 5_000,
  };
  assert.equal(canRotateSecret(active, 4_999), false);
  assert.throws(
    () => updateState(active, 'secret-version-rotate', { secretVersion: '2', now: 4_999 }),
    /lease is active/,
  );
  assert.equal(canRotateSecret(active, 5_000), true);
  const rotated = updateState(active, 'secret-version-rotate', { secretVersion: '2', now: 5_000 });
  assert.equal(rotated.secretVersion, 2);
  assert.equal(rotated.leaseToken, null);
  assert.equal(rotated.leaseExpiresAt, 0);
});

test('channel config and plan contain IDs and secret version but no webhook URL', () => {
  const config = loadChannelConfig(CONFIG_PATH);
  const plan = buildChannelPlan(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')), 'init');
  assert.equal(config.documentPath, 'alertChannels/production-discord');
  assert.equal(plan.initialState.disabled, true);
  assert.equal(plan.initialState.secretVersion, 1);
  assert.doesNotMatch(JSON.stringify(plan), /DISCORD_WEBHOOK_URL|webhookUrl/i);
});

test('channel config rejects webhook URL input and latest secret version', () => {
  const source = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  source.webhookUrl = 'https://discord.invalid/never-accepted';
  assert.throws(() => buildChannelPlan(source, 'init'), /webhook URLs are forbidden/);
  const latest = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  latest.secret.version = 'latest';
  assert.throws(() => buildChannelPlan(latest, 'init'), /numeric Secret Manager version/);
});

test('normalized channel config initializes and updates through Firestore transactions', async () => {
  const config = loadChannelConfig(CONFIG_PATH);
  const firestore = fakeFirestore();
  const initialized = await initializeChannel(firestore, config);
  assert.equal(initialized.secretVersion, 1);
  assert.equal(initialized.disabled, true);
  assert.deepEqual(firestore.read(), initialized);

  const resumed = await transactChannel(firestore, config, 'resume');
  assert.equal(resumed.secretVersion, 1);
  assert.equal(resumed.disabled, false);

  const rotated = await transactChannel(firestore, config, 'secret-version-rotate', {
    secretVersion: '2',
    now: 0,
  });
  assert.equal(rotated.secretVersion, 2);
  assert.equal(rotated.leaseToken, null);
  assert.equal(rotated.leaseExpiresAt, 0);
});
