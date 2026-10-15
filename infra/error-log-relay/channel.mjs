#!/usr/bin/env node

import { createRequire } from 'node:module';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = resolve(SCRIPT_DIRECTORY, 'config.example.json');
const requireRelayDependency = createRequire(
  new URL('../../apps/alerting/package.json', import.meta.url),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_VERSION = /^[1-9][0-9]*$/;
const STATE_KEYS = [
  'disabled',
  'leaseExpiresAt',
  'leaseToken',
  'nextAllowedAt',
  'schemaVersion',
  'secretVersion',
];

/**
 * Channel state is intentionally small and contains no webhook URL or payload.
 * The SDK is loaded through the relay package boundary so this operator tool
 * cannot silently use a second Firestore dependency tree.
 */

export function loadChannelConfig(path = DEFAULT_CONFIG) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  assertNoWebhookInput(config);
  if (config.schemaVersion !== 1) throw new Error('config.schemaVersion must be 1');
  const projectId = config.gcp?.projectId;
  const databaseId = config.firestore?.databaseId;
  const documentPath = config.firestore?.channelDocumentPath;
  const secretVersion = config.secret?.version;
  if (
    ![projectId, databaseId, documentPath, secretVersion].every(
      (value) => typeof value === 'string' && value.length > 0,
    )
  ) {
    throw new Error(
      'channel config requires projectId, firestore.databaseId, channelDocumentPath, and secret.version',
    );
  }
  const numericSecretVersion = parseSecretVersion(secretVersion, 'config.secret.version');
  assertDocumentPath(documentPath);
  if (databaseId === '(default)')
    throw new Error('channel state requires a separate Firestore database');
  return { projectId, databaseId, documentPath, secretVersion: numericSecretVersion };
}

export function initialState(secretVersion, disabled = true) {
  const numericSecretVersion = parseSecretVersion(secretVersion, 'secretVersion');
  if (typeof disabled !== 'boolean') throw new Error('disabled must be boolean');
  return {
    schemaVersion: 1,
    secretVersion: numericSecretVersion,
    disabled,
    nextAllowedAt: 0,
    leaseToken: null,
    leaseExpiresAt: 0,
  };
}

export function assertChannelState(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('channel state must be an object');
  }
  const keys = Object.keys(state).sort();
  if (
    keys.length !== STATE_KEYS.length ||
    keys.some((key, index) => key !== [...STATE_KEYS].sort()[index])
  ) {
    throw new Error(`channel state fields must be exactly ${STATE_KEYS.join(', ')}`);
  }
  if (state.schemaVersion !== 1) throw new Error('channel state schemaVersion must be 1');
  assertStateSecretVersion(state.secretVersion, 'channel state secretVersion');
  if (typeof state.disabled !== 'boolean')
    throw new Error('channel state disabled must be boolean');
  assertMilliseconds(state.nextAllowedAt, 'channel state nextAllowedAt');
  if (
    state.leaseToken !== null &&
    (typeof state.leaseToken !== 'string' || !UUID.test(state.leaseToken))
  ) {
    throw new Error('channel state leaseToken must be null or a UUID');
  }
  assertMilliseconds(state.leaseExpiresAt, 'channel state leaseExpiresAt');
  if (state.leaseToken === null && state.leaseExpiresAt !== 0) {
    throw new Error('channel state leaseExpiresAt must be 0 when leaseToken is null');
  }
  return state;
}

export function updateState(state, command, { secretVersion, now = Date.now() } = {}) {
  assertChannelState(state);
  if (!Number.isInteger(now) || now < 0)
    throw new Error('now must be a non-negative millisecond timestamp');
  switch (command) {
    case 'resume':
      return { ...state, disabled: false };
    case 'disable':
      return { ...state, disabled: true };
    case 'cooldown-clear':
      return { ...state, nextAllowedAt: 0 };
    case 'secret-version-rotate': {
      const numericSecretVersion = parseSecretVersion(secretVersion, 'secret version');
      if (state.leaseToken !== null && state.leaseExpiresAt > now) {
        throw new Error('cannot rotate secret while the channel lease is active');
      }
      return {
        ...state,
        secretVersion: numericSecretVersion,
        leaseToken: null,
        leaseExpiresAt: 0,
      };
    }
    default:
      throw new Error(`unsupported state command: ${command}`);
  }
}

export function canRotateSecret(state, now = Date.now()) {
  assertChannelState(state);
  return state.leaseToken === null || state.leaseExpiresAt <= now;
}

export function buildChannelPlan(config, command, options = {}) {
  if (
    ![
      'plan',
      'status',
      'init',
      'resume',
      'disable',
      'cooldown-clear',
      'secret-version-rotate',
    ].includes(command)
  ) {
    throw new Error(`unsupported channel command: ${command}`);
  }
  const normalized = loadChannelConfigObject(config);
  if (command === 'secret-version-rotate')
    parseSecretVersion(options.secretVersion, 'secret version');
  return {
    command,
    projectId: normalized.projectId,
    databaseId: normalized.databaseId,
    documentPath: normalized.documentPath,
    ...(command === 'init' ? { initialState: initialState(normalized.secretVersion, true) } : {}),
    ...(command === 'secret-version-rotate'
      ? { secretVersion: parseSecretVersion(options.secretVersion, 'secret version') }
      : {}),
    effects:
      command === 'status' || command === 'plan' ? 'read-only' : 'transactional state update',
    invariant:
      'The document contains only schemaVersion, secretVersion, disabled, nextAllowedAt, leaseToken, and leaseExpiresAt.',
  };
}

export function createFirestore(config) {
  const { Firestore } = requireRelayDependency('@google-cloud/firestore');
  return new Firestore({ projectId: config.projectId, databaseId: config.databaseId });
}

export async function readChannelState(firestore, config) {
  const snapshot = await firestore.doc(config.documentPath).get();
  if (!snapshot.exists) throw new Error(`channel document does not exist: ${config.documentPath}`);
  return assertChannelState(snapshot.data());
}

export async function initializeChannel(firestore, config) {
  const reference = firestore.doc(config.documentPath);
  const desired = initialState(config.secretVersion, true);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists)
      throw new Error(`refusing to overwrite existing channel document: ${config.documentPath}`);
    transaction.create(reference, desired);
  });
  return desired;
}

export async function transactChannel(firestore, config, command, options = {}) {
  if (command === 'init') return initializeChannel(firestore, config);
  const reference = firestore.doc(config.documentPath);
  let updated;
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists)
      throw new Error(`channel document does not exist: ${config.documentPath}`);
    const current = assertChannelState(snapshot.data());
    updated = updateState(current, command, {
      secretVersion: options.secretVersion,
      now: options.now,
    });
    transaction.update(reference, updated);
  });
  return updated;
}

function loadChannelConfigObject(config) {
  assertNoWebhookInput(config);
  if (config === null || typeof config !== 'object') throw new Error('config must be an object');
  const normalized =
    config.gcp && config.firestore && config.secret
      ? {
          projectId: config.gcp?.projectId,
          databaseId: config.firestore?.databaseId,
          documentPath: config.firestore?.channelDocumentPath,
          secretVersion: config.secret?.version,
        }
      : {
          projectId: config.projectId,
          databaseId: config.databaseId,
          documentPath: config.documentPath,
          secretVersion: config.secretVersion,
        };
  if (
    ![normalized.projectId, normalized.databaseId, normalized.documentPath].every(
      (value) => typeof value === 'string' && value.length > 0,
    ) ||
    (typeof normalized.secretVersion !== 'string' &&
      !Number.isSafeInteger(normalized.secretVersion))
  ) {
    throw new Error(
      'channel config requires projectId, firestore.databaseId, channelDocumentPath, and secret.version',
    );
  }
  normalized.secretVersion = parseSecretVersion(normalized.secretVersion, 'config.secret.version');
  assertDocumentPath(normalized.documentPath);
  if (normalized.databaseId === '(default)')
    throw new Error('channel state requires a separate Firestore database');
  return normalized;
}

function assertNoWebhookInput(value) {
  if (value === null || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'webhookUrl' || key === 'DISCORD_WEBHOOK_URL' || key === 'webhookURL') {
      throw new Error('channel tool accepts a secret version only; webhook URLs are forbidden');
    }
    assertNoWebhookInput(nested);
  }
}

function parseSecretVersion(value, label) {
  if (typeof value !== 'string' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a numeric Secret Manager version, never latest`);
  }
  if (typeof value === 'string' && !NUMERIC_VERSION.test(value)) {
    throw new Error(`${label} must be a numeric Secret Manager version, never latest`);
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return numeric;
}

function assertStateSecretVersion(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function assertDocumentPath(path) {
  if (typeof path !== 'string' || !/^([^/]+\/[^/]+)(\/[^/]+\/[^/]+)*$/.test(path)) {
    throw new Error('channelDocumentPath must contain alternating collection/document segments');
  }
}

function assertMilliseconds(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative millisecond timestamp`);
}

function parseArgs(argv) {
  const options = { config: DEFAULT_CONFIG };
  let command = 'plan';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      if (arg === '--config') options.config = argv[++index];
      else if (arg === '--secret-version') options.secretVersion = argv[++index];
      else if (arg === '--now') options.now = Number(argv[++index]);
      else if (arg === '--disabled') options.disabled = true;
      else if (arg === '--help' || arg === '-h') options.help = true;
      else throw new Error(`Unknown argument: ${arg}`);
    } else if (command === 'plan') {
      command =
        arg === 'cooldownclear'
          ? 'cooldown-clear'
          : arg === 'secretversionrotate'
            ? 'secret-version-rotate'
            : arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return { command, options };
}

function help() {
  return [
    'Usage: node infra/error-log-relay/channel.mjs <command> --config path',
    '',
    'Commands: plan, status, init, resume, disable, cooldown-clear, secret-version-rotate',
    'Aliases: cooldownclear, secretversionrotate',
    'secret-version-rotate requires --secret-version <numeric-version>.',
    'The tool accepts a Secret Manager version and never accepts a webhook URL.',
  ].join('\n');
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    return;
  }
  const config = loadChannelConfig(options.config);
  if (command === 'plan') {
    console.log(JSON.stringify(buildChannelPlan(config, 'plan', options), null, 2));
    return;
  }
  if (command === 'status') {
    const firestore = createFirestore(config);
    console.log(JSON.stringify(await readChannelState(firestore, config), null, 2));
    return;
  }
  if (command === 'init') {
    const firestore = createFirestore(config);
    console.log(JSON.stringify(await initializeChannel(firestore, config), null, 2));
    return;
  }
  if (command === 'secret-version-rotate')
    parseSecretVersion(options.secretVersion, 'secret version');
  const firestore = createFirestore(config);
  console.log(JSON.stringify(await transactChannel(firestore, config, command, options), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
