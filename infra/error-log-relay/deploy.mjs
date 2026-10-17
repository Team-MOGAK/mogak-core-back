#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = resolve(SCRIPT_DIRECTORY, 'config.example.json');
const REQUIRED_APIS = [
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'iamcredentials.googleapis.com',
  'logging.googleapis.com',
  'pubsub.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com',
];
const RESOURCE_ID = /^[a-z][a-z0-9-]{2,62}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SERVICE_ACCOUNT =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/;
const DIGEST_IMAGE = /@sha256:[a-f0-9]{64}$/i;
const NUMERIC_VERSION = /^[1-9][0-9]*$/;
const METRIC_ID = /^[a-z][a-z0-9-]{0,99}$/;

/**
 * The deployment file is deliberately JSON driven. Values from the config are
 * passed as individual gcloud argv entries; no config value is interpolated
 * into a shell command.
 */

export function loadConfig(path = DEFAULT_CONFIG) {
  const source = readFileSync(path, 'utf8');
  return validateConfig(JSON.parse(source));
}

export function validateConfig(config) {
  assertObject(config, 'config');
  assert(config.schemaVersion === 1, 'config.schemaVersion must be 1');
  assertObject(config.gcp, 'config.gcp');
  assertMatch(config.gcp.projectId, PROJECT_ID, 'config.gcp.projectId');
  assertNonEmpty(config.gcp.region, 'config.gcp.region');

  assertObject(config.source, 'config.source');
  assertMatch(config.source.apiService, RESOURCE_ID, 'config.source.apiService');
  assert(
    config.source.environment === 'development' || config.source.environment === 'production',
    'config.source.environment must be development or production',
  );
  assert(
    config.source.producer === 'mogak-core-api',
    'config.source.producer must match the trusted mogak-core-api producer',
  );

  assertObject(config.relay, 'config.relay');
  assertMatch(config.relay.service, RESOURCE_ID, 'config.relay.service');
  assert(
    config.relay.service !== config.source.apiService,
    'relay.service must differ from source.apiService',
  );
  assertNonEmpty(config.relay.image, 'config.relay.image');
  assertMatch(config.relay.serviceAccount, SERVICE_ACCOUNT, 'config.relay.serviceAccount');
  assertMatch(config.relay.pushServiceAccount, SERVICE_ACCOUNT, 'config.relay.pushServiceAccount');
  assertPositiveInteger(config.relay.timeoutSeconds, 'config.relay.timeoutSeconds');
  assert(config.relay.timeoutSeconds <= 15, 'relay.timeoutSeconds must be at most 15 seconds');
  assert(config.relay.concurrency === 1, 'relay.concurrency must be 1');
  assert(config.relay.minInstances === 0, 'relay.minInstances must be 0');
  assertPositiveInteger(config.relay.maxInstances, 'config.relay.maxInstances');
  assert(config.relay.maxInstances <= 10, 'relay.maxInstances must be a small value (10 or less)');
  assertNonEmpty(config.relay.memory, 'config.relay.memory');
  assertNonEmpty(config.relay.cpu, 'config.relay.cpu');
  assertNonEmpty(config.relay.pushPath, 'config.relay.pushPath');
  assert(config.relay.pushPath.startsWith('/'), 'relay.pushPath must start with /');

  assertObject(config.secret, 'config.secret');
  assertMatch(config.secret.name, RESOURCE_ID, 'config.secret.name');
  assertNumericVersion(config.secret.version, 'config.secret.version');

  assertObject(config.topics, 'config.topics');
  for (const key of ['source', 'quarantine', 'deadLetter']) {
    assertMatch(config.topics[key], RESOURCE_ID, `config.topics.${key}`);
  }
  assertObject(config.subscriptions, 'config.subscriptions');
  for (const key of ['source', 'quarantine', 'deadLetter']) {
    assertMatch(config.subscriptions[key], RESOURCE_ID, `config.subscriptions.${key}`);
  }
  assertObject(config.sink, 'config.sink');
  assertMatch(config.sink.name, RESOURCE_ID, 'config.sink.name');
  assertMatch(config.sink.metricName, METRIC_ID, 'config.sink.metricName');
  assert(config.sink.enabled === false, 'sink must start disabled in config');

  assertObject(config.pubsub, 'config.pubsub');
  assert(config.pubsub.ackDeadlineSeconds === 30, 'pubsub.ackDeadlineSeconds must be 30');
  assert(config.pubsub.minRetryDelaySeconds === 10, 'pubsub.minRetryDelaySeconds must be 10');
  assert(config.pubsub.maxRetryDelaySeconds === 600, 'pubsub.maxRetryDelaySeconds must be 600');
  assert(config.pubsub.maxDeliveryAttempts === 100, 'pubsub.maxDeliveryAttempts must be 100');
  assert(config.pubsub.retentionDays === 7, 'pubsub.retentionDays must be 7');

  const expectedSubscription = fullResourceName(
    'subscriptions',
    config.gcp.projectId,
    config.subscriptions.source,
  );
  assert(
    config.expectedSubscription === expectedSubscription,
    'expectedSubscription must be the source subscription full name',
  );
  const expectedQuarantineTopic = fullResourceName(
    'topics',
    config.gcp.projectId,
    config.topics.quarantine,
  );
  assert(
    config.quarantineTopic === expectedQuarantineTopic,
    'quarantineTopic must be the quarantine topic full name',
  );

  const filter = buildSinkFilter(config);
  assert(!/relay/i.test(filter), 'the source filter must never select relay logs');
  return config;
}

export function buildSinkFilter(config) {
  const projectId = config.gcp.projectId;
  const sourceService = config.source.apiService;
  const producer = config.source.producer;
  return [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${sourceService}"`,
    `logName="projects/${projectId}/logs/run.googleapis.com%2Fstdout"`,
    'severity=ERROR',
    'jsonPayload.level=50',
    `jsonPayload.environment="${config.source.environment}"`,
    'jsonPayload.alertEligible=true',
    'jsonPayload.schemaVersion=1',
    `jsonPayload.producer="${producer}"`,
  ].join('\n');
}

export function buildMissingEligibilityMetricFilter(config) {
  const projectId = config.gcp.projectId;
  const sourceService = config.source.apiService;
  const producer = config.source.producer;
  return [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${sourceService}"`,
    `logName="projects/${projectId}/logs/run.googleapis.com%2Fstdout"`,
    'severity=ERROR',
    `jsonPayload.environment="${config.source.environment}"`,
    `jsonPayload.producer="${producer}"`,
    'NOT jsonPayload.alertEligible=true',
    'NOT jsonPayload.alertEligible=false',
  ].join('\n');
}

export function buildPreflightChecks(config) {
  validateConfig(config);
  const project = config.gcp.projectId;
  const region = config.gcp.region;
  const checks = [
    check(
      'required-apis',
      gcloudArgs('services', 'list', `--project=${project}`, '--enabled', '--format=json'),
      'All required APIs must already be enabled.',
    ),
    check(
      'secret-version',
      gcloudArgs(
        'secrets',
        'versions',
        'describe',
        config.secret.version,
        `--secret=${config.secret.name}`,
        `--project=${project}`,
        '--format=json',
      ),
      `Secret ${config.secret.name} version ${config.secret.version} must be ENABLED.`,
    ),
    check(
      'source-api-service',
      gcloudArgs(
        'run',
        'services',
        'describe',
        config.source.apiService,
        `--region=${region}`,
        `--project=${project}`,
        '--format=json',
      ),
      'The source API Cloud Run service must already exist.',
    ),
    {
      name: 'auth-config',
      kind: 'static-auth-config',
      readOnly: true,
      expected:
        'The planned Cloud Run service forbids unauthenticated access and the planned Pub/Sub push uses the dedicated push service account.',
    },
  ];
  return checks;
}

export function buildDeploymentPlan(config, options = {}) {
  validateConfig(config);
  const activateSink = options.activateSink === true;
  const stagingVerified = options.stagingVerified === true;
  if (activateSink && !stagingVerified) {
    throw new Error('--activate-sink requires --staging-verified');
  }
  const project = config.gcp.projectId;
  const region = config.gcp.region;
  const sourceTopic = topicFullName(project, config.topics.source);
  const quarantineTopic = topicFullName(project, config.topics.quarantine);
  const deadLetterTopic = topicFullName(project, config.topics.deadLetter);
  const sourceSubscription = subscriptionFullName(project, config.subscriptions.source);
  const relayServiceUrl = `<resolved ${config.relay.service} status.url>`;
  const relayPushEndpoint = `${relayServiceUrl}${config.relay.pushPath}`;
  const operations = [];

  for (const account of [
    {
      email: config.relay.serviceAccount,
      id: serviceAccountId(config.relay.serviceAccount),
      name: 'relay',
    },
    {
      email: config.relay.pushServiceAccount,
      id: serviceAccountId(config.relay.pushServiceAccount),
      name: 'push',
    },
  ]) {
    operations.push(
      describeOperation(
        `service-account-${account.name}`,
        gcloudArgs(
          'iam',
          'service-accounts',
          'describe',
          account.email,
          `--project=${project}`,
          '--format=json',
        ),
        gcloudArgs(
          'iam',
          'service-accounts',
          'create',
          account.id,
          `--project=${project}`,
          `--display-name=mogak error log relay ${account.name}`,
        ),
        `Create only the named dedicated ${account.name} service account if it does not exist.`,
      ),
    );
  }

  for (const [name, topic] of Object.entries(config.topics)) {
    const fullTopic = topicFullName(project, topic);
    operations.push(
      describeOperation(
        `topic-${name}`,
        gcloudArgs(
          'pubsub',
          'topics',
          'describe',
          fullTopic,
          `--project=${project}`,
          '--format=json',
        ),
        gcloudArgs(
          'pubsub',
          'topics',
          'create',
          topic,
          `--project=${project}`,
          '--message-retention-duration=7d',
        ),
        `Create or retain only the explicitly configured ${name} topic.`,
        gcloudArgs(
          'pubsub',
          'topics',
          'update',
          topic,
          `--project=${project}`,
          '--message-retention-duration=7d',
        ),
      ),
    );
  }

  const serviceAgent = pubsubServiceAgent(project, '<resolved project number>');
  const iam = iamOperations(config, {
    project,
    sourceTopic,
    quarantineTopic,
    deadLetterTopic,
    sourceSubscription,
    serviceAgent,
  });
  const preRunIamNames = new Set([
    'relay-publish-quarantine',
    'relay-selected-secret-version',
    'pubsub-agent-token-creator',
    'pubsub-agent-publish-dlq',
  ]);
  operations.push(...iam.filter((operation) => preRunIamNames.has(operation.name)));

  operations.push({
    name: 'relay-cloud-run-service',
    action: 'deploy-or-update',
    command: gcloudArgs(
      'run',
      'deploy',
      config.relay.service,
      `--image=${config.relay.image}`,
      `--region=${region}`,
      `--project=${project}`,
      `--service-account=${config.relay.serviceAccount}`,
      `--timeout=${config.relay.timeoutSeconds}s`,
      `--concurrency=${config.relay.concurrency}`,
      `--min=${config.relay.minInstances}`,
      `--max=${config.relay.maxInstances}`,
      `--cpu=${config.relay.cpu}`,
      `--memory=${config.relay.memory}`,
      '--port=8080',
      '--no-allow-unauthenticated',
      '--execution-environment=gen2',
      '--platform=managed',
      `--set-env-vars=${runtimeEnv(config)}`,
      `--set-secrets=DISCORD_WEBHOOK_URL=${config.secret.name}:${config.secret.version}`,
      '--quiet',
    ),
    mutate: true,
    rationale:
      'Deploy the independently built digest with a 15-second budget and authenticated ingress.',
  });

  operations.push(...iam.filter((operation) => operation.name === 'push-service-invoker'));

  operations.push(
    describeOperation(
      'subscription-source',
      gcloudArgs(
        'pubsub',
        'subscriptions',
        'describe',
        config.subscriptions.source,
        `--project=${project}`,
        '--format=json',
      ),
      gcloudArgs(
        'pubsub',
        'subscriptions',
        'create',
        config.subscriptions.source,
        `--topic=${sourceTopic}`,
        `--project=${project}`,
        ...subscriptionArgs(config, {
          deadLetterTopic,
          pushEndpoint: relayPushEndpoint,
          pushAudience: relayServiceUrl,
        }),
      ),
      'Configure the source subscription with authenticated push, bounded retry, retention, and DLQ after the relay URL exists.',
      gcloudArgs(
        'pubsub',
        'subscriptions',
        'update',
        config.subscriptions.source,
        `--project=${project}`,
        ...subscriptionArgs(config, {
          deadLetterTopic,
          pushEndpoint: relayPushEndpoint,
          pushAudience: relayServiceUrl,
        }),
      ),
      sourceTopic,
    ),
  );
  for (const [name, topicKey] of [
    ['quarantine', 'quarantine'],
    ['deadLetter', 'deadLetter'],
  ]) {
    operations.push(
      describeOperation(
        `subscription-${name}`,
        gcloudArgs(
          'pubsub',
          'subscriptions',
          'describe',
          config.subscriptions[name],
          `--project=${project}`,
          '--format=json',
        ),
        gcloudArgs(
          'pubsub',
          'subscriptions',
          'create',
          config.subscriptions[name],
          `--topic=${topicFullName(project, config.topics[topicKey])}`,
          `--project=${project}`,
          ...retainedSubscriptionArgs(config),
        ),
        `Create the retained operator-visible ${name} subscription without an unauthenticated push endpoint.`,
        gcloudArgs(
          'pubsub',
          'subscriptions',
          'update',
          config.subscriptions[name],
          `--project=${project}`,
          ...retainedSubscriptionArgs(config),
        ),
        topicFullName(project, config.topics[topicKey]),
      ),
    );
  }

  operations.push(...iam.filter((operation) => operation.name === 'pubsub-agent-subscribe-source'));

  operations.push(
    describeOperation(
      'missing-eligibility-metric',
      gcloudArgs(
        'logging',
        'metrics',
        'describe',
        config.sink.metricName,
        `--project=${project}`,
        '--format=json',
      ),
      gcloudArgs(
        'logging',
        'metrics',
        'create',
        config.sink.metricName,
        `--project=${project}`,
        `--log-filter=${buildMissingEligibilityMetricFilter(config)}`,
        `--description=${config.source.environment} API ERROR logs with missing or invalid alertEligible`,
      ),
      'Create or reconcile a queryable counter for source API ERROR records that omit or invalidate alertEligible.',
      gcloudArgs(
        'logging',
        'metrics',
        'update',
        config.sink.metricName,
        `--project=${project}`,
        `--log-filter=${buildMissingEligibilityMetricFilter(config)}`,
        `--description=${config.source.environment} API ERROR logs with missing or invalid alertEligible`,
      ),
    ),
  );

  operations.push({
    name: 'sink-error-filter',
    action: 'create-or-update',
    describe: gcloudArgs(
      'logging',
      'sinks',
      'describe',
      config.sink.name,
      `--project=${project}`,
      '--format=json',
    ),
    command: gcloudArgs(
      'logging',
      'sinks',
      'update',
      config.sink.name,
      `pubsub.googleapis.com/${sourceTopic}`,
      `--project=${project}`,
      `--log-filter=${buildSinkFilter(config)}`,
      '--disabled',
      '--quiet',
    ),
    createCommand: gcloudArgs(
      'logging',
      'sinks',
      'create',
      config.sink.name,
      `pubsub.googleapis.com/${sourceTopic}`,
      `--project=${project}`,
      `--log-filter=${buildSinkFilter(config)}`,
      '--unique-writer-identity',
      '--disabled',
      '--quiet',
    ),
    mutate: true,
    rationale:
      'Keep the configured sink disabled while its resource and publisher IAM are reconciled.',
  });
  operations.push(...iam.filter((operation) => operation.name === 'sink-writer-publish-source'));

  if (activateSink) {
    operations.push({
      name: 'sink-activate',
      action: 'explicit-activation',
      command: gcloudArgs(
        'logging',
        'sinks',
        'update',
        config.sink.name,
        `--project=${project}`,
        '--no-disabled',
      ),
      mutate: true,
      rationale:
        'Enable the configured sink only after resource reconciliation, publisher IAM, and disabled-state postflight pass.',
    });
  }

  return {
    schemaVersion: 1,
    mode: options.mode ?? 'plan',
    project,
    region,
    sinkEnabled: activateSink,
    preflight: buildPreflightChecks(config),
    operations,
    warnings: [
      'No persistent delivery database is configured; process-local cooldown resets on restart and is not shared across instances.',
      'The image must be an immutable sha256 digest before --apply.',
      'The relay and push service accounts are intentionally distinct.',
      'Pub/Sub delivery is at least once; preserve errorId during manual replay.',
      'The Pub/Sub service agent and sink writer identity are resolved during apply before IAM bindings are applied.',
    ],
  };
}

export function runtimeEnv(config) {
  const project = config.gcp.projectId;
  return [
    `GCP_PROJECT_ID=${project}`,
    `SOURCE_API_SERVICE=${config.source.apiService}`,
    `SOURCE_ENVIRONMENT=${config.source.environment}`,
    `EXPECTED_SUBSCRIPTION=${config.expectedSubscription}`,
    `QUARANTINE_TOPIC=${config.quarantineTopic}`,
  ].join(',');
}

export function gcloudArgs(...args) {
  return ['--quiet', ...args];
}

export function subscriptionArgs(config, { deadLetterTopic, pushEndpoint, pushAudience }) {
  assertNonEmpty(pushAudience, 'pushAudience');
  return [
    `--ack-deadline=${config.pubsub.ackDeadlineSeconds}`,
    '--retain-acked-messages',
    '--expiration-period=never',
    `--message-retention-duration=${config.pubsub.retentionDays}d`,
    `--min-retry-delay=${config.pubsub.minRetryDelaySeconds}s`,
    `--max-retry-delay=${config.pubsub.maxRetryDelaySeconds}s`,
    `--dead-letter-topic=${deadLetterTopic}`,
    `--max-delivery-attempts=${config.pubsub.maxDeliveryAttempts}`,
    `--push-endpoint=${pushEndpoint}`,
    `--push-auth-service-account=${config.relay.pushServiceAccount}`,
    `--push-auth-token-audience=${pushAudience}`,
  ];
}

export function retainedSubscriptionArgs(config) {
  return [
    `--ack-deadline=${config.pubsub.ackDeadlineSeconds}`,
    '--retain-acked-messages',
    '--expiration-period=never',
    `--message-retention-duration=${config.pubsub.retentionDays}d`,
  ];
}

export function iamOperations(
  config,
  { project, sourceTopic, quarantineTopic, deadLetterTopic, sourceSubscription, serviceAgent },
) {
  const relay = config.relay.serviceAccount;
  const push = config.relay.pushServiceAccount;
  return [
    iamBinding(
      'relay-publish-quarantine',
      ['pubsub', 'topics', 'add-iam-policy-binding', quarantineTopic],
      relay,
      'roles/pubsub.publisher',
      'Allow only the relay service account to write restricted failure diagnostics.',
    ),
    iamBinding(
      'relay-selected-secret-version',
      ['secrets', 'add-iam-policy-binding', config.secret.name],
      relay,
      'roles/secretmanager.secretAccessor',
      'Bind Secret Manager access at the named secret only; runtime injects the selected numeric version.',
      { project },
    ),
    iamBinding(
      'push-service-invoker',
      ['run', 'services', 'add-iam-policy-binding', config.relay.service],
      push,
      'roles/run.invoker',
      'Grant service-level invoke only to the authenticated Pub/Sub push identity.',
      { project, region: config.gcp.region },
    ),
    iamBinding(
      'pubsub-agent-token-creator',
      ['iam', 'service-accounts', 'add-iam-policy-binding', push],
      serviceAgent,
      'roles/iam.serviceAccountTokenCreator',
      'Allow the Pub/Sub service agent to mint OIDC tokens for authenticated push.',
      { project },
    ),
    iamBinding(
      'pubsub-agent-publish-dlq',
      ['pubsub', 'topics', 'add-iam-policy-binding', deadLetterTopic],
      serviceAgent,
      'roles/pubsub.publisher',
      'Allow the Pub/Sub service agent to forward messages to the DLQ topic.',
    ),
    iamBinding(
      'pubsub-agent-subscribe-source',
      ['pubsub', 'subscriptions', 'add-iam-policy-binding', sourceSubscription],
      serviceAgent,
      'roles/pubsub.subscriber',
      'Allow the Pub/Sub service agent to track delivery attempts for the DLQ policy.',
    ),
    {
      name: 'sink-writer-publish-source',
      action: 'iam-binding-after-sink-describe',
      command: gcloudArgs(
        'pubsub',
        'topics',
        'add-iam-policy-binding',
        sourceTopic,
        `--member=<sink writer identity>`,
        '--role=roles/pubsub.publisher',
        `--project=${project}`,
      ),
      mutate: true,
      rationale:
        'Resolve the sink writer identity from the named sink, then grant publisher only on the source topic.',
    },
  ];
}

export function buildPreflightResult(config, results) {
  const expectedApis = new Set(REQUIRED_APIS);
  const enabled = new Set(
    (results.requiredApis ?? []).flatMap((entry) => {
      const name = entry.config?.name ?? entry.name;
      return typeof name === 'string' ? [name] : [];
    }),
  );
  const missingApis = [...expectedApis].filter((api) => !enabled.has(api));
  const failures = [];
  if (missingApis.length > 0) failures.push(`Required APIs are missing: ${missingApis.join(', ')}`);
  const secret = results.secretVersion;
  if (!secret || secret.state !== 'ENABLED')
    failures.push(`Secret version ${config.secret.version} must be ENABLED.`);
  if (!results.sourceApiService) failures.push('Source API Cloud Run service does not exist.');
  return { ok: failures.length === 0, failures, missingApis };
}

export function buildPostflightChecks(config, relayServiceUrl) {
  validateConfig(config);
  const serviceUrl = normalizeServiceUrl(relayServiceUrl);
  assert(serviceUrl.startsWith('https://'), 'relay service URL must use HTTPS');
  const project = config.gcp.projectId;
  return [
    {
      name: 'source-subscription-auth',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'pubsub',
        'subscriptions',
        'describe',
        config.subscriptions.source,
        `--project=${project}`,
        '--format=json',
      ),
      expected: `Source subscription must push to ${serviceUrl}${config.relay.pushPath} with audience ${serviceUrl} and the dedicated push service account.`,
    },
    {
      name: 'quarantine-subscription-retention',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'pubsub',
        'subscriptions',
        'describe',
        config.subscriptions.quarantine,
        `--project=${project}`,
        '--format=json',
      ),
      expected:
        'Quarantine subscription must retain acknowledged messages for seven days, never expire, and have no push endpoint.',
    },
    {
      name: 'dead-letter-subscription-retention',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'pubsub',
        'subscriptions',
        'describe',
        config.subscriptions.deadLetter,
        `--project=${project}`,
        '--format=json',
      ),
      expected:
        'Dead-letter subscription must retain acknowledged messages for seven days, never expire, and have no push endpoint.',
    },
    {
      name: 'relay-service-auth-policy',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'run',
        'services',
        'get-iam-policy',
        config.relay.service,
        `--region=${config.gcp.region}`,
        `--project=${project}`,
        '--format=json',
      ),
      expected:
        'Relay service roles/run.invoker must contain only the dedicated push service account.',
    },
    {
      name: 'sink-disabled-filter',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'logging',
        'sinks',
        'describe',
        config.sink.name,
        `--project=${project}`,
        '--format=json',
      ),
      expected:
        'The named sink must target the source topic with the exact ERROR filter and remain disabled until the final activation command.',
    },
    {
      name: 'missing-eligibility-metric',
      kind: 'gcloud-json',
      argv: gcloudArgs(
        'logging',
        'metrics',
        'describe',
        config.sink.metricName,
        `--project=${project}`,
        '--format=json',
      ),
      expected:
        'The named counter metric must retain the exact source API ERROR filter for missing or invalid alertEligible.',
    },
  ];
}

export function isDesiredSubscription(value, config, relayServiceUrl) {
  if (value === null || typeof value !== 'object') return false;
  const serviceUrl = normalizeServiceUrl(relayServiceUrl);
  const push = value.pushConfig ?? {};
  const oidc = push.oidcToken ?? {};
  return (
    value.topic === topicFullName(config.gcp.projectId, config.topics.source) &&
    durationSeconds(value.ackDeadlineSeconds) === config.pubsub.ackDeadlineSeconds &&
    value.retainAckedMessages === true &&
    isNeverExpiring(value.expirationPolicy) &&
    durationSeconds(value.messageRetentionDuration) === config.pubsub.retentionDays * 86400 &&
    durationSeconds(value.retryPolicy?.minimumBackoff) === config.pubsub.minRetryDelaySeconds &&
    durationSeconds(value.retryPolicy?.maximumBackoff) === config.pubsub.maxRetryDelaySeconds &&
    value.deadLetterPolicy?.deadLetterTopic ===
      topicFullName(config.gcp.projectId, config.topics.deadLetter) &&
    durationNumber(value.deadLetterPolicy?.maxDeliveryAttempts) ===
      config.pubsub.maxDeliveryAttempts &&
    push.pushEndpoint === `${serviceUrl}${config.relay.pushPath}` &&
    oidc.serviceAccountEmail === config.relay.pushServiceAccount &&
    oidc.audience === serviceUrl
  );
}

export function isDesiredRetainedSubscription(value, config, topicKey) {
  if (value === null || typeof value !== 'object') return false;
  const push = value.pushConfig;
  return (
    value.topic === topicFullName(config.gcp.projectId, config.topics[topicKey]) &&
    durationSeconds(value.ackDeadlineSeconds) === config.pubsub.ackDeadlineSeconds &&
    value.retainAckedMessages === true &&
    isNeverExpiring(value.expirationPolicy) &&
    durationSeconds(value.messageRetentionDuration) === config.pubsub.retentionDays * 86400 &&
    (push === undefined || push === null || push.pushEndpoint === undefined)
  );
}

export function isDesiredSink(value, config) {
  if (value === null || typeof value !== 'object') return false;
  return (
    value.destination ===
      `pubsub.googleapis.com/${topicFullName(config.gcp.projectId, config.topics.source)}` &&
    value.filter === buildSinkFilter(config) &&
    value.disabled === true
  );
}

export function isDesiredMetric(value, config) {
  if (value === null || typeof value !== 'object') return false;
  const expectedName = `projects/${config.gcp.projectId}/metrics/${config.sink.metricName}`;
  return (
    (value.name === expectedName || value.name === config.sink.metricName) &&
    value.filter === buildMissingEligibilityMetricFilter(config)
  );
}

export function isDesiredRunInvokerPolicy(value, config) {
  if (value === null || typeof value !== 'object') return false;
  const bindings = (value.bindings ?? []).filter((binding) => binding.role === 'roles/run.invoker');
  const members = bindings.flatMap((binding) => binding.members ?? []);
  return (
    bindings.length === 1 &&
    members.length === 1 &&
    members[0] === `serviceAccount:${config.relay.pushServiceAccount}`
  );
}

export function isAuthenticatedPushConfig(value, config, relayServiceUrl) {
  return (
    isDesiredSubscription(value?.subscription ?? value, config, relayServiceUrl) &&
    isDesiredRunInvokerPolicy(value?.iamPolicy ?? value, config)
  );
}

export function postflight(config, context, runner = runGcloud) {
  validateConfig(config);
  const relayServiceUrl = normalizeServiceUrl(context?.relayUrl);
  const checks = buildPostflightChecks(config, relayServiceUrl);
  const observed = {};
  for (const item of checks) {
    const result = runner(item.argv);
    if (result.status !== 0) {
      throw new Error(`postflight ${item.name} failed: ${result.stderr || result.stdout}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(`postflight ${item.name} returned invalid JSON`);
    }
    observed[item.name] = parsed;
  }
  const failures = [];
  if (!isDesiredSubscription(observed['source-subscription-auth'], config, relayServiceUrl)) {
    failures.push(
      'Source subscription push endpoint, audience, retry, retention, expiration policy, or DLQ is incorrect.',
    );
  }
  if (
    !isDesiredRetainedSubscription(
      observed['quarantine-subscription-retention'],
      config,
      'quarantine',
    )
  ) {
    failures.push(
      'Quarantine subscription topic, retention, expiration policy, or push state is incorrect.',
    );
  }
  if (
    !isDesiredRetainedSubscription(
      observed['dead-letter-subscription-retention'],
      config,
      'deadLetter',
    )
  ) {
    failures.push(
      'Dead-letter subscription topic, retention, expiration policy, or push state is incorrect.',
    );
  }
  if (!isDesiredRunInvokerPolicy(observed['relay-service-auth-policy'], config)) {
    failures.push(
      'Relay Cloud Run invoker policy is not restricted to the dedicated push service account.',
    );
  }
  if (!isDesiredSink(observed['sink-disabled-filter'], config)) {
    failures.push('Logging sink destination, source filter, or disabled state is incorrect.');
  }
  if (!isDesiredMetric(observed['missing-eligibility-metric'], config)) {
    failures.push('Missing-eligibility metric name or filter is incorrect.');
  }
  if (failures.length > 0) throw new Error(['postflight failed:', ...failures].join('\n'));
  return {
    ok: true,
    relayServiceUrl,
    pushEndpoint: `${relayServiceUrl}${config.relay.pushPath}`,
    pushAudience: relayServiceUrl,
    checks: checks.map((item) => item.name),
  };
}

export function isImmutableImage(image) {
  return DIGEST_IMAGE.test(image);
}

export async function preflight(config, runner = runGcloud) {
  validateConfig(config);
  const checks = buildPreflightChecks(config);
  const results = {};
  for (const item of checks) {
    if (item.kind === 'static-auth-config') continue;
    const result = runner(item.argv);
    if (result.status !== 0)
      throw new Error(`preflight ${item.name} failed: ${result.stderr || result.stdout}`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = result.stdout.trim();
    }
    if (item.name === 'required-apis') results.requiredApis = parsed;
    if (item.name === 'secret-version') results.secretVersion = parsed;
    if (item.name === 'source-api-service') results.sourceApiService = parsed;
  }
  const result = buildPreflightResult(config, results);
  if (!result.ok) throw new Error(`preflight failed closed:\n${result.failures.join('\n')}`);
  return result;
}

function assertImmutableSubscriptionTopics(config, runner) {
  const expected = [
    [
      'source',
      config.subscriptions.source,
      topicFullName(config.gcp.projectId, config.topics.source),
    ],
    [
      'quarantine',
      config.subscriptions.quarantine,
      topicFullName(config.gcp.projectId, config.topics.quarantine),
    ],
    [
      'deadLetter',
      config.subscriptions.deadLetter,
      topicFullName(config.gcp.projectId, config.topics.deadLetter),
    ],
  ];
  for (const [name, subscription, topic] of expected) {
    const described = runner(
      gcloudArgs(
        'pubsub',
        'subscriptions',
        'describe',
        subscription,
        `--project=${config.gcp.projectId}`,
        '--format=json',
      ),
    );
    if (described.status !== 0) {
      if (isNotFound(described)) continue;
      throw new Error(
        `subscription-${name} immutable-topic precheck failed: ${described.stderr || described.stdout}`,
      );
    }
    assertImmutableSubscriptionTopic(
      { name: `subscription-${name}`, immutableTopic: topic },
      described,
    );
  }
}

function assertImmutableSubscriptionTopic(operation, described) {
  if (operation.immutableTopic === null || operation.immutableTopic === undefined) return;
  let value;
  try {
    value = JSON.parse(described.stdout);
  } catch {
    throw new Error(`${operation.name} immutable-topic precheck returned invalid JSON`);
  }
  if (value.topic !== operation.immutableTopic) {
    throw new Error(
      `${operation.name} has immutable topic ${value.topic ?? '<missing>'}; expected ${operation.immutableTopic}`,
    );
  }
}

export function runGcloud(args) {
  return spawnSync('gcloud', args.slice(), {
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function apply(config, options = {}) {
  validateConfig(config);
  if (!isImmutableImage(config.relay.image)) {
    throw new Error(
      '--apply requires relay.image to be an immutable @sha256 digest; placeholders are allowed only for --plan.',
    );
  }
  if (options.activateSink && !options.stagingVerified) {
    throw new Error('--activate-sink requires --staging-verified');
  }
  const runner = options.runner ?? runGcloud;
  await preflight(config, runner);
  assertImmutableSubscriptionTopics(config, runner);
  const plan = buildDeploymentPlan(config, { ...options, mode: 'apply' });
  const context = {
    projectNumber: await resolveProjectNumber(config, runner),
    relayUrl: null,
    sinkWriterIdentity: null,
  };
  const results = [];
  const activation = plan.operations.find((operation) => operation.name === 'sink-activate');
  const resourceOperations = plan.operations.filter(
    (operation) => operation.name !== 'sink-activate',
  );
  for (const operation of resourceOperations) {
    if (operation.describe !== undefined) {
      const described = runner(toGcloudArgv(resolveCommand(operation.describe, context)));
      if (described.status === 0) {
        assertImmutableSubscriptionTopic(operation, described);
        const updateCommand =
          operation.updateCommand === undefined ? operation.command : operation.updateCommand;
        if (updateCommand === null || updateCommand === undefined) {
          results.push({ name: operation.name, status: 'already-present' });
          continue;
        }
        const result = runner(toGcloudArgv(resolveCommand(updateCommand, context)));
        if (result.status !== 0)
          throw new Error(`${operation.name} update failed: ${result.stderr || result.stdout}`);
        if (operation.name === 'sink-error-filter') {
          context.sinkWriterIdentity = resolveSinkWriterIdentity(config, runner);
        }
        results.push({ name: operation.name, status: 'updated' });
        continue;
      }
      if (!isNotFound(described))
        throw new Error(
          `${operation.name} describe failed: ${described.stderr || described.stdout}`,
        );
    }
    if (operation.command === undefined && operation.createCommand === undefined) continue;
    const command = toGcloudArgv(
      resolveCommand(operation.createCommand ?? operation.command, context),
    );
    const result = runner(command);
    if (result.status !== 0)
      throw new Error(`${operation.name} failed: ${result.stderr || result.stdout}`);
    if (operation.name === 'relay-cloud-run-service') {
      context.relayUrl = resolveRelayUrl(config, runner);
    }
    if (operation.name === 'sink-error-filter') {
      context.sinkWriterIdentity = resolveSinkWriterIdentity(config, runner);
    }
    results.push({ name: operation.name, status: 'applied' });
  }
  const postflightResult = postflight(config, context, runner);
  if (activation !== undefined) {
    const result = runner(toGcloudArgv(resolveCommand(activation.command, context)));
    if (result.status !== 0) {
      throw new Error(`sink activation failed: ${result.stderr || result.stdout}`);
    }
    results.push({ name: activation.name, status: 'activated' });
  }
  return { ...plan, results, postflight: postflightResult };
}

function resolveCommand(command, context) {
  const relayUrl = context.relayUrl ?? '<resolved relay status.url>';
  const sinkWriter = context.sinkWriterIdentity ?? '<sink writer identity unresolved>';
  const projectNumber = context.projectNumber ?? '<resolved project number>';
  return command
    .map((part) =>
      part
        .replace(/<resolved [^>]+ status\.url>/, relayUrl)
        .replaceAll('<resolved project number>', projectNumber)
        .replaceAll('<sink writer identity>', sinkWriter),
    )
    .filter((part) => part !== undefined);
}

function toGcloudArgv(command) {
  return command[0] === 'gcloud' ? command.slice(1) : command;
}

function resolveProjectNumber(config, runner) {
  const result = runner(
    gcloudArgs('projects', 'describe', config.gcp.projectId, '--format=value(projectNumber)'),
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`could not resolve project number: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function resolveRelayUrl(config, runner) {
  const result = runner(
    gcloudArgs(
      'run',
      'services',
      'describe',
      config.relay.service,
      `--region=${config.gcp.region}`,
      `--project=${config.gcp.projectId}`,
      '--format=value(status.url)',
    ),
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`could not resolve relay service URL: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function resolveSinkWriterIdentity(config, runner) {
  const result = runner(
    gcloudArgs(
      'logging',
      'sinks',
      'describe',
      config.sink.name,
      `--project=${config.gcp.projectId}`,
      '--format=value(writerIdentity)',
    ),
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`could not resolve sink writer identity: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function isNotFound(result) {
  return /not found|not_found|does not exist|was not found/i.test(
    `${result.stderr ?? ''}\n${result.stdout ?? ''}`,
  );
}

function parseArgs(argv) {
  const options = {
    mode: 'plan',
    config: DEFAULT_CONFIG,
    activateSink: false,
    stagingVerified: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') options.mode = 'plan';
    else if (arg === '--apply') options.mode = 'apply';
    else if (arg === '--activate-sink') options.activateSink = true;
    else if (arg === '--staging-verified') options.stagingVerified = true;
    else if (arg === '--config') options.config = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function help() {
  return [
    'Usage: node infra/error-log-relay/deploy.mjs [--plan|--apply] [--config path]',
    '',
    '--plan is the default and emits read-only preflight checks plus shell-free argv operations.',
    '--apply runs the closed preflight and then the explicitly configured resource operations.',
    '--activate-sink requires --staging-verified and is required to enable the configured sink.',
    'The plan does not create or inspect a delivery database; cooldown is process-local.',
  ].join('\n');
}

function check(name, argv, expected) {
  return { name, kind: 'gcloud-json', argv, readOnly: true, expected };
}

function describeOperation(
  name,
  describe,
  create,
  rationale,
  update = null,
  immutableTopic = null,
) {
  return {
    name,
    action: 'ensure',
    describe,
    command: create,
    updateCommand: update,
    immutableTopic,
    mutate: true,
    rationale,
  };
}

function iamBinding(name, commandArgs, member, role, rationale, flags = {}) {
  const args = [...commandArgs, `--member=serviceAccount:${member}`, `--role=${role}`];
  for (const [key, value] of Object.entries(flags)) {
    if (value !== null && value !== undefined) args.push(`--${camelToKebab(key)}=${value}`);
  }
  return { name, action: 'iam-binding', command: gcloudArgs(...args), mutate: true, rationale };
}

function assertObject(value, label) {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNonEmpty(value, label) {
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `${label} must be a non-empty string`,
  );
}

function assertMatch(value, pattern, label) {
  assert(typeof value === 'string' && pattern.test(value), `${label} has an invalid value`);
}

function assertPositiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function assertNumericVersion(value, label) {
  assert(
    typeof value === 'string' && NUMERIC_VERSION.test(value),
    `${label} must be a numeric Secret Manager version, never latest`,
  );
}

function fullResourceName(kind, project, id) {
  return `projects/${project}/${kind}/${id}`;
}

function topicFullName(project, id) {
  return fullResourceName('topics', project, id);
}

function subscriptionFullName(project, id) {
  return fullResourceName('subscriptions', project, id);
}

function serviceAccountId(email) {
  return email.slice(0, email.indexOf('@'));
}

function normalizeServiceUrl(value) {
  assertNonEmpty(value, 'relay service URL');
  return value.replace(/\/+$/, '');
}

function durationNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return Number(value);
  return Number.NaN;
}

function durationSeconds(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(value);
  if (!match) return Number.NaN;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * multipliers[match[2]];
}

function isNeverExpiring(policy) {
  return (
    typeof policy === 'object' &&
    policy !== null &&
    !Array.isArray(policy) &&
    (Object.keys(policy).length === 0 || policy.ttl === undefined || policy.ttl === '')
  );
}

function pubsubServiceAgent(project, projectNumber) {
  return `service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    return;
  }
  const config = loadConfig(options.config);
  if (options.mode === 'apply') {
    apply(config, options)
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
    return;
  }
  const plan = buildDeploymentPlan(config, options);
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
