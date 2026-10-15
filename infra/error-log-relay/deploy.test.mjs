import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildDeploymentPlan,
  buildPreflightChecks,
  buildMissingEligibilityMetricFilter,
  buildSinkFilter,
  apply,
  isDesiredRunInvokerPolicy,
  isDesiredMetric,
  isDesiredRetainedSubscription,
  isDesiredSink,
  isDesiredSubscription,
  isAuthenticatedPushConfig,
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

function channelDocument(config) {
  return {
    fields: {
      schemaVersion: { integerValue: '1' },
      secretVersion: { integerValue: config.secret.version },
      disabled: { booleanValue: true },
      nextAllowedAt: { integerValue: '0' },
      leaseToken: { nullValue: 'NULL_VALUE' },
      leaseExpiresAt: { integerValue: '0' },
    },
  };
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
    existing,
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
    'firestore.googleapis.com',
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
    if (command.includes('firestore databases describe')) {
      return jsonResult({
        name: config.firestore.databaseId,
        locationId: config.firestore.location,
      });
    }
    if (command.includes('secrets versions describe')) return jsonResult({ state: 'ENABLED' });
    if (command.includes('auth print-access-token')) return success('token\n');
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
  const fetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => channelDocument(config),
  });
  return {
    calls,
    runner,
    fetcher,
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

test('example config produces a default plan without invoking gcloud', () => {
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
  assert.ok(plan.preflight.some((item) => item.name === 'firestore-channel-document'));
  assert.ok(plan.operations.some((item) => item.name === 'relay-cloud-run-service'));
  assert.match(result.stdout, /--no-allow-unauthenticated/);
  const commands = [...plan.preflight, ...plan.operations]
    .flatMap((item) => [
      item.argv ?? [],
      item.command ?? [],
      item.createCommand ?? [],
      item.updateCommand ?? [],
    ])
    .map((command) => command.join(' '));
  assert.ok(commands.every((command) => !/firestore databases create/.test(command)));
  assert.ok(commands.every((command) => !/services enable/.test(command)));
});

test('sink filter is exact and cannot select relay output', () => {
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

test('missing eligibility metric filter is source scoped and excludes explicit booleans', () => {
  const config = loadConfig(CONFIG_PATH);
  const filter = buildMissingEligibilityMetricFilter(config);
  assert.match(filter, /resource\.labels\.service_name="mogak-spring"/);
  assert.match(filter, /run\.googleapis\.com%2Fstdout/);
  assert.match(filter, /severity=ERROR/);
  assert.match(filter, /jsonPayload\.environment="production"/);
  assert.match(filter, /jsonPayload\.producer="mogak-core-api"/);
  assert.match(filter, /NOT jsonPayload\.alertEligible=true/);
  assert.match(filter, /NOT jsonPayload\.alertEligible=false/);
  assert.doesNotMatch(filter, /relay/i);
});

test('config rejects source and relay identity overlap', () => {
  const config = configFixture();
  config.relay.service = config.source.apiService;
  assert.throws(() => validateConfig(config), /must differ/);
});

test('config rejects latest secret version and default Firestore database', () => {
  const latest = configFixture();
  latest.secret.version = 'latest';
  assert.throws(() => validateConfig(latest), /numeric Secret Manager version/);

  const defaultDb = configFixture();
  defaultDb.firestore.databaseId = '(default)';
  assert.throws(() => validateConfig(defaultDb), /separate Firestore database/);
});

test('plan keeps sink disabled and image placeholder is allowed only for planning', () => {
  const config = loadConfig(CONFIG_PATH);
  const plan = buildDeploymentPlan(config);
  const sink = plan.operations.find((item) => item.name === 'sink-error-filter');
  assert.ok(sink.command.includes('--disabled'));
  assert.ok(sink.createCommand.includes('--disabled'));
  assert.equal(
    plan.operations.find((item) => item.name === 'sink-activate'),
    undefined,
  );
  const subscriptions = plan.operations.filter((item) => item.name.startsWith('subscription-'));
  for (const subscription of subscriptions) {
    assert.ok(subscription.command.includes('--expiration-period=never'));
    assert.ok(subscription.updateCommand.includes('--expiration-period=never'));
    if (subscription.createCommand !== undefined)
      assert.ok(subscription.createCommand.includes('--expiration-period=never'));
  }
  assert.ok(plan.operations.some((item) => item.name === 'missing-eligibility-metric'));
  assert.match(plan.warnings.join('\n'), /immutable/);
  assert.throws(() => buildDeploymentPlan(config, { activateSink: true }), /staging-verified/);
});

test('preflight includes required APIs, database, document, source service, secret, and auth checks', () => {
  const config = loadConfig(CONFIG_PATH);
  const names = buildPreflightChecks(config).map((check) => check.name);
  assert.deepEqual(names, [
    'required-apis',
    'firestore-database',
    'secret-version',
    'source-api-service',
    'auth-config',
    'firestore-channel-document',
  ]);
});

test('runtime environment fixes production and selected secret version', () => {
  const config = loadConfig(CONFIG_PATH);
  const environment = runtimeEnv(config);
  assert.match(environment, /GCP_PROJECT_ID=my-mogak-project/);
  assert.match(environment, /DISCORD_SECRET_VERSION=1/);
  assert.match(environment, /NODE_ENV=production/);
  assert.doesNotMatch(environment, /(?:^|,)PORT=/);
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
  const pathAudience = {
    ...valid,
    subscription: {
      ...valid.subscription,
      pushConfig: {
        ...valid.subscription.pushConfig,
        oidcToken: {
          ...valid.subscription.pushConfig.oidcToken,
          audience: 'https://relay.example.test/pubsub/push',
        },
      },
    },
  };
  assert.equal(
    isDesiredSubscription(pathAudience.subscription, config, 'https://relay.example.test'),
    false,
  );
  valid.iamPolicy.bindings[0].members.push('allUsers');
  assert.equal(isAuthenticatedPushConfig(valid, config, 'https://relay.example.test'), false);
});

test('expiration policy must explicitly represent never for source, quarantine, and DLQ', () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config);
  const invalidPolicies = [
    ['missing', undefined],
    ['null', null],
    ['default ttl', { ttl: '2678400s' }],
  ];
  for (const [, policy] of invalidPolicies) {
    const source = { ...harness.subscription };
    const quarantine = harness.retainedSubscription(config.topics.quarantine);
    const deadLetter = harness.retainedSubscription(config.topics.deadLetter);
    if (policy === undefined) {
      delete source.expirationPolicy;
      delete quarantine.expirationPolicy;
      delete deadLetter.expirationPolicy;
    } else {
      source.expirationPolicy = policy;
      quarantine.expirationPolicy = policy;
      deadLetter.expirationPolicy = policy;
    }
    assert.equal(isDesiredSubscription(source, config, harness.serviceUrl), false);
    assert.equal(isDesiredRetainedSubscription(quarantine, config, 'quarantine'), false);
    assert.equal(isDesiredRetainedSubscription(deadLetter, config, 'deadLetter'), false);
  }

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
});

test('fake apply bootstraps resources, repairs managed auth, and orders runtime IAM first', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config);
  const result = await apply(config, { runner: harness.runner, fetcher: harness.fetcher });
  assert.equal(result.postflight.ok, true);

  const runIndex = callIndex(
    harness.calls,
    (args) =>
      args.includes('run') && args.includes('deploy') && args.includes(config.relay.service),
  );
  const preRunBindings = [
    ['roles/secretmanager.secretAccessor', config.secret.name],
    ['roles/datastore.user', config.firestore.databaseId],
    ['roles/pubsub.publisher', config.topics.quarantine],
  ];
  for (const [role, resource] of preRunBindings) {
    const index = callIndex(
      harness.calls,
      (args) => args.includes(`--role=${role}`) && args.some((arg) => arg.includes(resource)),
    );
    assert.ok(index < runIndex, `${role} must be granted before Cloud Run deploy`);
  }
  assert.equal(
    harness.calls.some(
      (args) =>
        args.includes('roles/pubsub.subscriber') &&
        args.some((arg) => arg.includes('error-log-relay@')),
    ),
    false,
  );

  const runCommand = harness.calls[runIndex];
  assert.ok(runCommand.includes('--port=8080'));
  assert.doesNotMatch(
    runCommand.find((arg) => arg.startsWith('--set-env-vars=')),
    /PORT=/,
  );
  const sourceCreate = findCall(
    harness.calls,
    (args) =>
      args.includes('subscriptions') &&
      args.includes('create') &&
      args.includes(config.subscriptions.source),
  );
  assert.ok(sourceCreate.includes(`--push-endpoint=${harness.serviceUrl}${config.relay.pushPath}`));
  assert.ok(sourceCreate.includes(`--push-auth-token-audience=${harness.serviceUrl}`));
  const subscriptionMutations = harness.calls.filter(
    (args) =>
      args.includes('subscriptions') && (args.includes('create') || args.includes('update')),
  );
  assert.equal(subscriptionMutations.length, 3);
  for (const command of subscriptionMutations) {
    assert.ok(command.includes('--expiration-period=never'));
  }
  const metricCreate = findCall(
    harness.calls,
    (args) => args.includes('logging') && args.includes('metrics') && args.includes('create'),
  );
  assert.ok(metricCreate.includes(`--log-filter=${buildMissingEligibilityMetricFilter(config)}`));
  const writerIndex = callIndex(
    harness.calls,
    (args) =>
      args.includes('topics') &&
      args.includes('add-iam-policy-binding') &&
      args.includes('--role=roles/pubsub.publisher') &&
      args.some((arg) => arg.includes(config.topics.source)),
  );
  const postflightSinkIndex = harness.calls.reduce(
    (last, args, index) =>
      args.includes('logging') &&
      args.includes('sinks') &&
      args.includes('describe') &&
      args.includes('--format=json')
        ? index
        : last,
    -1,
  );
  assert.ok(writerIndex < postflightSinkIndex);
  assert.equal(result.postflight.pushAudience, harness.serviceUrl);
});

test('fake apply reconciles existing resources and updates an existing disabled sink', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true });
  const result = await apply(config, { runner: harness.runner, fetcher: harness.fetcher });
  assert.equal(result.postflight.ok, true);
  assert.equal(
    harness.calls.some((args) => args.includes('service-accounts') && args.includes('create')),
    false,
  );
  const sinkUpdate = findCall(
    harness.calls,
    (args) => args.includes('logging') && args.includes('sinks') && args.includes('update'),
  );
  assert.ok(sinkUpdate.includes('--disabled'));
  assert.equal(sinkUpdate.includes('--no-disabled'), false);
  const metricUpdate = findCall(
    harness.calls,
    (args) => args.includes('logging') && args.includes('metrics') && args.includes('update'),
  );
  assert.ok(metricUpdate.includes(`--log-filter=${buildMissingEligibilityMetricFilter(config)}`));
  assert.equal(
    harness.calls.some(
      (args) => args.includes('logging') && args.includes('metrics') && args.includes('create'),
    ),
    false,
  );
});

test('fake apply activation explicitly enables an existing sink', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true });
  const result = await apply(config, {
    runner: harness.runner,
    fetcher: harness.fetcher,
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
  assert.equal(sinkUpdate.includes('--no-disabled'), false);
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
    () =>
      apply(config, {
        runner: harness.runner,
        fetcher: harness.fetcher,
        activateSink: true,
        stagingVerified: true,
      }),
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

test('activation is not attempted when disabled-state postflight fails', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, { existing: true, postflightFailure: true });
  await assert.rejects(
    () =>
      apply(config, {
        runner: harness.runner,
        fetcher: harness.fetcher,
        activateSink: true,
        stagingVerified: true,
      }),
    /postflight failed/,
  );
  assert.equal(
    harness.calls.some((args) => args.includes('--no-disabled')),
    false,
  );
});

test('missing expiration policy blocks sink activation during postflight', async () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config, {
    existing: true,
    missingExpirationPolicy: true,
  });
  await assert.rejects(
    () =>
      apply(config, {
        runner: harness.runner,
        fetcher: harness.fetcher,
        activateSink: true,
        stagingVerified: true,
      }),
    /expiration policy/,
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

test('postflight rejects a path audience even when the push endpoint is correct', () => {
  const config = digestConfig();
  const harness = fakeApplyHarness(config);
  const invalid = {
    ...harness.subscription,
    pushConfig: {
      ...harness.subscription.pushConfig,
      oidcToken: {
        ...harness.subscription.pushConfig.oidcToken,
        audience: `${harness.serviceUrl}${config.relay.pushPath}`,
      },
    },
  };
  let subscriptionCall = true;
  assert.throws(
    () =>
      postflight(config, { relayUrl: harness.serviceUrl }, (args) => {
        if (args.includes('pubsub') && args.includes('subscriptions')) {
          subscriptionCall = false;
          return jsonResult(invalid);
        }
        return jsonResult(harness.iamPolicy);
      }),
    /Source subscription push endpoint/,
  );
  assert.equal(subscriptionCall, false);
});
