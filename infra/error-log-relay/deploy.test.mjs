import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  apply,
  buildDeploymentPlan,
  buildMissingEligibilityMetricFilter,
  buildPreflightChecks,
  buildSinkFilter,
  isAuthenticatedPushConfig,
  isDesiredMetric,
  isDesiredRetainedSubscription,
  isDesiredRunInvokerPolicy,
  isDesiredSink,
  isDesiredSubscription,
  loadConfig,
  postflight,
  runtimeEnv,
  validateConfig,
} from './deploy.mjs';

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(DIRECTORY, 'config.example.json');

function configFixture() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function digestConfig() {
  const config = configFixture();
  config.relay.image = `asia-northeast3-docker.pkg.dev/${config.gcp.projectId}/mogak-relay/error-log-relay@sha256:${'a'.repeat(64)}`;
  return config;
}

function jsonResult(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: '' };
}

function success(stdout = '') {
  return { status: 0, stdout, stderr: '' };
}

function notFound() {
  return { status: 1, stdout: '', stderr: 'NOT_FOUND' };
}

function fakeApplyHarness(
  config,
  {
    existing = false,
    wrongTopic = false,
    postflightFailure = false,
    missingExpirationPolicy = false,
  } = {},
) {
  const serviceUrl = 'https://relay.example.test';
  const sinkWriterIdentity = 'serviceAccount:logging-sink-writer@example.iam.gserviceaccount.com';
  const calls = [];
  const state = {
    sink: existing,
    sinkEnabled: false,
    sourceSubscription: existing,
    quarantineSubscription: existing,
    deadLetterSubscription: existing,
    metric: existing,
    wrongTopic,
  };
  const requiredApis = [
    'artifactregistry.googleapis.com',
    'cloudbuild.googleapis.com',
    'iamcredentials.googleapis.com',
    'logging.googleapis.com',
    'pubsub.googleapis.com',
    'run.googleapis.com',
    'secretmanager.googleapis.com',
  ].map((name) => ({ config: { name } }));
  const subscription = {
    topic: `projects/${config.gcp.projectId}/topics/${config.topics.source}`,
    ackDeadlineSeconds: 30,
    retainAckedMessages: true,
    expirationPolicy: missingExpirationPolicy ? undefined : {},
    messageRetentionDuration: '604800s',
    retryPolicy: { minimumBackoff: '10s', maximumBackoff: '600s' },
    deadLetterPolicy: {
      deadLetterTopic: `projects/${config.gcp.projectId}/topics/${config.topics.deadLetter}`,
      maxDeliveryAttempts: 100,
    },
    pushConfig: {
      pushEndpoint: `${serviceUrl}${config.relay.pushPath}`,
      oidcToken: {
        serviceAccountEmail: config.relay.pushServiceAccount,
        audience: serviceUrl,
      },
    },
  };
  const retainedSubscription = (topic) => ({
    topic: `projects/${config.gcp.projectId}/topics/${topic}`,
    ackDeadlineSeconds: 30,
    retainAckedMessages: true,
    expirationPolicy: missingExpirationPolicy ? undefined : {},
    messageRetentionDuration: '604800s',
  });
  const sourceSubscription = {
    ...subscription,
    ...(wrongTopic
      ? { topic: `projects/${config.gcp.projectId}/topics/${config.topics.quarantine}` }
      : {}),
  };
  const sink = {
    destination: `pubsub.googleapis.com/projects/${config.gcp.projectId}/topics/${config.topics.source}`,
    filter: buildSinkFilter(config),
    disabled: true,
  };
  const metric = {
    name: `projects/${config.gcp.projectId}/metrics/${config.sink.metricName}`,
    filter: buildMissingEligibilityMetricFilter(config),
  };
  const iamPolicy = {
    bindings: [
      {
        role: 'roles/run.invoker',
        members: [`serviceAccount:${config.relay.pushServiceAccount}`],
      },
    ],
  };
  const commandText = (args) => args.join(' ');
  const has = (args, value) => args.includes(value);
  const runner = (args) => {
    calls.push([...args]);
    const command = commandText(args);
    if (command.includes('services list')) return jsonResult(requiredApis);
    if (command.includes('secrets versions describe')) return jsonResult({ state: 'ENABLED' });
    if (command.includes('projects describe') && command.includes('projectNumber'))
      return success('123456789\n');
    if (command.includes('run services get-iam-policy')) {
      return jsonResult(postflightFailure ? { bindings: [] } : iamPolicy);
    }
    if (command.includes('run services describe')) {
      if (has(args, '--format=value(status.url)')) return success(`${serviceUrl}\n`);
      return jsonResult({ metadata: { name: config.source.apiService } });
    }
    if (command.includes('pubsub subscriptions describe')) {
      if (has(args, config.subscriptions.source))
        return state.sourceSubscription ? jsonResult(sourceSubscription) : notFound();
      if (has(args, config.subscriptions.quarantine))
        return state.quarantineSubscription
          ? jsonResult(retainedSubscription(config.topics.quarantine))
          : notFound();
      if (has(args, config.subscriptions.deadLetter))
        return state.deadLetterSubscription
          ? jsonResult(retainedSubscription(config.topics.deadLetter))
          : notFound();
      return notFound();
    }
    if (
      command.includes('pubsub subscriptions create') ||
      command.includes('pubsub subscriptions update')
    ) {
      if (has(args, config.subscriptions.source)) state.sourceSubscription = true;
      if (has(args, config.subscriptions.quarantine)) state.quarantineSubscription = true;
      if (has(args, config.subscriptions.deadLetter)) state.deadLetterSubscription = true;
      return success();
    }
    if (command.includes('pubsub topics describe')) return existing ? jsonResult({}) : notFound();
    if (command.includes('pubsub topics create') || command.includes('pubsub topics update'))
      return success();
    if (command.includes('iam service-accounts describe'))
      return existing ? jsonResult({}) : notFound();
    if (command.includes('iam service-accounts create')) return success();
    if (command.includes('logging sinks describe') && has(args, '--format=value(writerIdentity)')) {
      return success(`${sinkWriterIdentity}\n`);
    }
    if (command.includes('logging metrics describe'))
      return state.metric ? jsonResult(metric) : notFound();
    if (command.includes('logging metrics create') || command.includes('logging metrics update')) {
      state.metric = true;
      return success();
    }
    if (command.includes('logging sinks describe'))
      return state.sink ? jsonResult({ ...sink, disabled: !state.sinkEnabled }) : notFound();
    if (command.includes('logging sinks create') || command.includes('logging sinks update')) {
      state.sink = true;
      state.sinkEnabled = has(args, '--no-disabled');
      return success();
    }
    if (command.includes('logging sinks update') && has(args, '--no-disabled')) {
      state.sinkEnabled = true;
      return success();
    }
    return success();
  };
  return {
    calls,
    runner,
    serviceUrl,
    subscription: sourceSubscription,
    retainedSubscription,
    sink,
    metric,
    iamPolicy,
  };
}

function findCall(calls, predicate) {
  const index = calls.findIndex(predicate);
  assert.notEqual(index, -1, 'expected fake gcloud call was not observed');
  return calls[index];
}

function callIndex(calls, predicate) {
  const index = calls.findIndex(predicate);
  assert.notEqual(index, -1, 'expected fake gcloud call was not observed');
  return index;
}

test('example config produces a default plan without invoking gcloud or state services', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(DIRECTORY, 'deploy.mjs'), '--config', CONFIG_PATH, '--plan'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/definitely/no-gcloud-here' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.sinkEnabled, false);
  assert.ok(plan.preflight.some((item) => item.name === 'secret-version'));
  assert.ok(!plan.preflight.some((item) => /firestore|channel/i.test(item.name)));
  assert.ok(plan.operations.some((item) => item.name === 'relay-cloud-run-service'));
  assert.match(result.stdout, /--no-allow-unauthenticated/);
  assert.doesNotMatch(result.stdout, /firestore|datastore|channelDocument|CHANNEL_DOCUMENT/i);
});

test('sink and metric filters use the configured source environment', () => {
  const development = configFixture();
  development.source.environment = 'development';
  validateConfig(development);
  assert.match(buildSinkFilter(development), /jsonPayload\.environment="development"/);
  assert.match(
    buildMissingEligibilityMetricFilter(development),
    /jsonPayload\.environment="development"/,
  );
  assert.match(runtimeEnv(development), /SOURCE_ENVIRONMENT=development/);
});

test('sink filter is source scoped and cannot select relay output', () => {
  const config = loadConfig(CONFIG_PATH);
  const filter = buildSinkFilter(config);
  assert.match(filter, /resource\.labels\.service_name="mogak-spring"/);
  assert.match(filter, /run\.googleapis\.com%2Fstdout/);
  assert.match(filter, /severity=ERROR/);
  assert.match(filter, /jsonPayload\.level=50/);
  assert.match(filter, /jsonPayload\.environment="production"/);
  assert.match(filter, /jsonPayload\.alertEligible=true/);
  assert.match(filter, /jsonPayload\.schemaVersion=1/);
  assert.doesNotMatch(filter, /relay/i);
});

test('config rejects an unsupported source environment and latest secret version', () => {
  const invalidEnvironment = configFixture();
  invalidEnvironment.source.environment = 'staging';
  assert.throws(() => validateConfig(invalidEnvironment), /development or production/);

  const latest = configFixture();
  latest.secret.version = 'latest';
  assert.throws(() => validateConfig(latest), /numeric Secret Manager version/);

  const wrongProducer = configFixture();
  wrongProducer.source.producer = 'other-producer';
  assert.throws(() => validateConfig(wrongProducer), /trusted mogak-core-api producer/);
});

test('config requires project-local and distinct service accounts', () => {
  for (const account of ['serviceAccount', 'pushServiceAccount']) {
    const foreign = configFixture();
    foreign.relay[account] = 'foreign-relay@foreign-project.iam.gserviceaccount.com';
    assert.throws(() => validateConfig(foreign), /belong to config\.gcp\.projectId/);
  }

  const shared = configFixture();
  shared.relay.pushServiceAccount = shared.relay.serviceAccount;
  assert.throws(() => validateConfig(shared), /serviceAccount.*distinct/);
});

test('topic and subscription identifiers are unique within their own resource kind', () => {
  const crossKindAlias = configFixture();
  crossKindAlias.subscriptions.source = crossKindAlias.topics.source;
  crossKindAlias.expectedSubscription = `projects/${crossKindAlias.gcp.projectId}/subscriptions/${crossKindAlias.subscriptions.source}`;
  assert.doesNotThrow(() => validateConfig(crossKindAlias));

  const topicAlias = configFixture();
  topicAlias.topics.quarantine = topicAlias.topics.source;
  assert.throws(() => validateConfig(topicAlias), /config\.topics.*distinct/);

  const subscriptionAlias = configFixture();
  subscriptionAlias.subscriptions.quarantine = subscriptionAlias.subscriptions.source;
  assert.throws(() => validateConfig(subscriptionAlias), /config\.subscriptions.*distinct/);
});

test('apply rejects a missing-resource subscription alias before invoking gcloud', async () => {
  const config = digestConfig();
  config.subscriptions.quarantine = config.subscriptions.source;
  const calls = [];

  await assert.rejects(
    () =>
      apply(config, {
        runner: (args) => {
          calls.push(args);
          return success();
        },
      }),
    /config\.subscriptions.*distinct/,
  );
  assert.equal(calls.length, 0);
});

test('config reserves response time above the 12-second handler budget', () => {
  for (const timeoutSeconds of [1, 12, 14, 16, '15', undefined]) {
    const config = configFixture();
    config.relay.timeoutSeconds = timeoutSeconds;
    assert.throws(() => validateConfig(config), /exactly 15 seconds/);
  }
  validateConfig(configFixture());
});

test('plan keeps sink disabled, pins the webhook secret, and does not add channel state', () => {
  const config = loadConfig(CONFIG_PATH);
  const plan = buildDeploymentPlan(config);
  const sink = plan.operations.find((item) => item.name === 'sink-error-filter');
  assert.ok(sink.command.includes('--disabled'));
  assert.ok(sink.createCommand.includes('--disabled'));
  assert.equal(
    plan.operations.find((item) => item.name === 'sink-activate'),
    undefined,
  );
  const run = plan.operations.find((item) => item.name === 'relay-cloud-run-service');
  assert.ok(run.command.includes('--set-secrets=DISCORD_WEBHOOK_URL=discord-webhook:1'));
  const env = run.command.find((arg) => arg.startsWith('--set-env-vars='));
  assert.doesNotMatch(env, /DISCORD_SECRET_VERSION/);
  assert.doesNotMatch(env, /NODE_ENV/);
  assert.doesNotMatch(env, /FIRESTORE|CHANNEL/);
  assert.match(plan.warnings.join('\n'), /process-local cooldown/);
  assert.throws(() => buildDeploymentPlan(config, { activateSink: true }), /staging-verified/);
});

test('preflight contains only external checks needed for the relay', () => {
  const config = loadConfig(CONFIG_PATH);
  const names = buildPreflightChecks(config).map((check) => check.name);
  assert.deepEqual(names, ['required-apis', 'secret-version', 'source-api-service', 'auth-config']);
  assert.ok(names.every((name) => !/firestore|channel|database/i.test(name)));
});

test('runtime environment carries source metadata without deployment-specific state', () => {
  const config = loadConfig(CONFIG_PATH);
  const environment = runtimeEnv(config);
  assert.match(environment, /GCP_PROJECT_ID=my-mogak-project/);
  assert.match(environment, /SOURCE_API_SERVICE=mogak-spring/);
  assert.match(environment, /SOURCE_ENVIRONMENT=production/);
  assert.match(
    environment,
    /EXPECTED_SUBSCRIPTION=projects\/my-mogak-project\/subscriptions\/mogak-api-error-relay/,
  );
  assert.match(
    environment,
    /QUARANTINE_TOPIC=projects\/my-mogak-project\/topics\/mogak-error-quarantine/,
  );
  assert.doesNotMatch(
    environment,
    /DISCORD_SECRET_VERSION|NODE_ENV|FIRESTORE|CHANNEL|(?:^|,)PORT=/,
  );
});

test('auth helper rejects unauthenticated invoker and mismatched push identity', () => {
  const config = loadConfig(CONFIG_PATH);
  const valid = {
    subscription: {
      pushConfig: {
        pushEndpoint: 'https://relay.example.test/pubsub/push',
        oidcToken: {
          serviceAccountEmail: config.relay.pushServiceAccount,
          audience: 'https://relay.example.test',
        },
      },
      topic: `projects/${config.gcp.projectId}/topics/${config.topics.source}`,
      ackDeadlineSeconds: 30,
      retainAckedMessages: true,
      expirationPolicy: {},
      messageRetentionDuration: '604800s',
      retryPolicy: { minimumBackoff: '10s', maximumBackoff: '600s' },
      deadLetterPolicy: {
        deadLetterTopic: `projects/${config.gcp.projectId}/topics/${config.topics.deadLetter}`,
        maxDeliveryAttempts: 100,
      },
    },
    iamPolicy: {
      bindings: [
        {
          role: 'roles/run.invoker',
          members: [`serviceAccount:${config.relay.pushServiceAccount}`],
        },
      ],
    },
  };
  assert.equal(isAuthenticatedPushConfig(valid, config, 'https://relay.example.test'), true);
  assert.equal(
    isDesiredSubscription(valid.subscription, config, 'https://relay.example.test'),
    true,
  );
  assert.equal(isDesiredRunInvokerPolicy(valid.iamPolicy, config), true);
  valid.iamPolicy.bindings[0].members.push('allUsers');
  assert.equal(isAuthenticatedPushConfig(valid, config, 'https://relay.example.test'), false);
});

test('retained subscriptions require an explicit never-expiring policy', () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config);
  const source = { ...harness.subscription, expirationPolicy: {} };
  const quarantine = {
    ...harness.retainedSubscription(config.topics.quarantine),
    expirationPolicy: {},
  };
  const deadLetter = {
    ...harness.retainedSubscription(config.topics.deadLetter),
    expirationPolicy: {},
  };
  assert.equal(isDesiredSubscription(source, config, harness.serviceUrl), true);
  assert.equal(isDesiredRetainedSubscription(quarantine, config, 'quarantine'), true);
  assert.equal(isDesiredRetainedSubscription(deadLetter, config, 'deadLetter'), true);

  for (const value of [undefined, null, { ttl: '2678400s' }]) {
    assert.equal(
      isDesiredSubscription({ ...source, expirationPolicy: value }, config, harness.serviceUrl),
      false,
    );
    assert.equal(
      isDesiredRetainedSubscription(
        { ...quarantine, expirationPolicy: value },
        config,
        'quarantine',
      ),
      false,
    );
  }
});

test('fake apply bootstraps resources and grants only required pre-run IAM', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config);
  const result = await apply(config, { runner: harness.runner });
  assert.equal(result.postflight.ok, true);

  const runIndex = callIndex(
    harness.calls,
    (args) =>
      args.includes('run') && args.includes('deploy') && args.includes(config.relay.service),
  );
  for (const [role, resource] of [
    ['roles/secretmanager.secretAccessor', config.secret.name],
    ['roles/pubsub.publisher', config.topics.quarantine],
  ]) {
    const index = callIndex(
      harness.calls,
      (args) => args.includes(`--role=${role}`) && args.some((arg) => arg.includes(resource)),
    );
    assert.ok(index < runIndex, `${role} must be granted before Cloud Run deploy`);
  }
  assert.equal(
    harness.calls.some(
      (args) =>
        args.includes('roles/datastore.user') ||
        args.some((arg) => /firestore|CHANNEL_DOCUMENT|FIRESTORE_DATABASE/.test(arg)),
    ),
    false,
  );
  const runCommand = harness.calls[runIndex];
  assert.ok(runCommand.includes('--port=8080'));
  const env = runCommand.find((arg) => arg.startsWith('--set-env-vars='));
  assert.match(env, /SOURCE_ENVIRONMENT=production/);
  assert.doesNotMatch(env, /NODE_ENV|DISCORD_SECRET_VERSION|FIRESTORE|CHANNEL/);
  const sourceCreate = findCall(
    harness.calls,
    (args) =>
      args.includes('subscriptions') &&
      args.includes('create') &&
      args.includes(config.subscriptions.source),
  );
  assert.ok(sourceCreate.includes(`--push-endpoint=${harness.serviceUrl}${config.relay.pushPath}`));
  assert.ok(sourceCreate.includes(`--push-auth-token-audience=${harness.serviceUrl}`));
  assert.equal(
    harness.calls.filter(
      (args) =>
        args.includes('subscriptions') && (args.includes('create') || args.includes('update')),
    ).length,
    3,
  );
  assert.equal(result.postflight.pushAudience, harness.serviceUrl);
});

test('fake apply activation explicitly enables an existing sink after postflight', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true });
  const result = await apply(config, {
    runner: harness.runner,
    activateSink: true,
    stagingVerified: true,
  });
  const sinkUpdate = findCall(
    harness.calls,
    (args) =>
      args.includes('logging') &&
      args.includes('sinks') &&
      args.includes('update') &&
      args.includes('--disabled'),
  );
  const activation = findCall(
    harness.calls,
    (args) => args.includes('logging') && args.includes('sinks') && args.includes('--no-disabled'),
  );
  assert.ok(
    callIndex(harness.calls, (args) => args === activation) >
      callIndex(harness.calls, (args) => args === sinkUpdate),
  );
  assert.equal(result.results.at(-1)?.name, 'sink-activate');
});

test('apply rejects an existing subscription with an immutable topic conflict before mutation', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true, wrongTopic: true });
  await assert.rejects(
    () => apply(config, { runner: harness.runner, activateSink: true, stagingVerified: true }),
    /immutable topic/,
  );
  assert.equal(
    harness.calls.some(
      (args) =>
        (args.includes('create') || args.includes('update') || args.includes('deploy')) &&
        !args.includes('describe'),
    ),
    false,
  );
  assert.equal(
    harness.calls.some((args) => args.includes('--no-disabled')),
    false,
  );
});

test('postflight checks retained subscriptions, disabled sink, and metric shape', () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true });
  const checks = postflight(config, { relayUrl: harness.serviceUrl }, harness.runner);
  assert.equal(checks.ok, true);
  assert.equal(
    isDesiredRetainedSubscription(
      harness.retainedSubscription(config.topics.quarantine),
      config,
      'quarantine',
    ),
    true,
  );
  assert.equal(isDesiredSink(harness.sink, config), true);
  assert.equal(isDesiredMetric(harness.metric, config), true);
});

test('postflight failure prevents explicit sink activation', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true, postflightFailure: true });
  await assert.rejects(
    () => apply(config, { runner: harness.runner, activateSink: true, stagingVerified: true }),
    /postflight failed/,
  );
  assert.equal(
    harness.calls.some((args) => args.includes('--no-disabled')),
    false,
  );
});
