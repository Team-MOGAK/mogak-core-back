# Error log Discord relay runbook

This runbook operates the independent @mogak/alerting service. The API writes
structured JSON to Cloud Run stdout. A narrowly filtered Cloud Logging sink
copies eligible ERROR records to Pub/Sub, and the relay validates and sends an
allowlisted message to Discord. WARNING records remain in Cloud Logging; they
are not sent to Discord.

Pub/Sub delivery is at least once. A duplicate Discord message is possible if
the relay sends successfully and the acknowledgement is lost. The relay keeps
only a process-local cooldown after a Discord 429; it resets on restart and is
independent per Cloud Run instance. There is no database or shared delivery
lock in this path.

The handler has a 12-second budget; `relay.timeoutSeconds` must be exactly 15
to leave time for the response. The publisher is initialized before the HTTP
server listens. Quarantine uses one direct Publish RPC with no SDK retry and a
timeout of at most two seconds, reduced to the remaining request budget.
Disconnects prevent subsequent calls and abort Discord fetches. An already
started Publish RPC cannot be forcibly cancelled through the public SDK; it
may still be accepted remotely before its deadline. A local failure is not
acknowledged, so quarantine records may also be duplicated on redelivery.

Both successful and 429 Discord response bodies are limited to 64KiB. An
oversized or malformed 429 body uses a valid Retry-After header or the existing
fallback cooldown and remains unacknowledged.

## Plan first

The deployment helper is JSON driven and plan first:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.example.json \
  --plan
```

--plan is also the default. It prints read-only preflight checks and shell-free
gcloud argv arrays without invoking gcloud. The example values are safe
placeholders; replace the project, service accounts, topic IDs, sink ID, secret
name/version, and immutable image digest in an operator-only copy before an
apply. Keep that copy out of commits.

## Configuration contract

infra/error-log-relay/config.example.json is the complete configuration shape.

Use separate development and production configuration copies. Each environment
must have distinct relay services, sinks, topics, subscriptions, and actual
Discord webhooks stored in separate Secret Manager secrets. Changing only
source.environment does not isolate resources: shared IDs can reconfigure an
existing production subscription or sink. Check all resource IDs and the secret
before applying either environment.

| Key                          | Contract                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| gcp.projectId                | Existing project that owns the API and relay resources.                                                                            |
| gcp.region                   | Cloud Run, Artifact Registry, and Pub/Sub operator region.                                                                         |
| source.apiService            | Existing API Cloud Run service. It must differ from the relay service.                                                             |
| source.environment           | development or production; the same value is placed in the sink filter and relay runtime.                                          |
| source.producer              | Must be mogak-core-api, matching the runtime's trusted API producer.                                                               |
| relay.service                | Separate relay Cloud Run service.                                                                                                  |
| relay.image                  | Immutable Artifact Registry image ending in @sha256:<64 hex digits>. A placeholder is accepted for a plan and rejected by --apply. |
| relay.serviceAccount         | Dedicated runtime identity used only by the relay.                                                                                 |
| relay.pushServiceAccount     | Dedicated Pub/Sub OIDC identity, distinct from the runtime identity.                                                               |
| secret.name / secret.version | Existing Secret Manager secret and an enabled positive numeric version. latest is rejected.                                        |
| topics.* / subscriptions.*   | Explicit source, quarantine, and DLQ IDs. Retained subscriptions never expire.                                                     |
| expectedSubscription         | Full source subscription name: projects/<project>/subscriptions/<id>.                                                              |
| quarantineTopic              | Full quarantine topic name: projects/<project>/topics/<id>.                                                                        |
| sink.name                    | Existing or newly owned sink identifier. The sink starts disabled.                                                                 |
| sink.metricName              | Cloud Logging counter ID for source ERROR records with missing or invalid alertEligible.                                           |

The relay runtime receives these values from the deployment plan:

| Environment variable  | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GCP_PROJECT_ID        | Configured project ID.                                                                                                  |
| SOURCE_API_SERVICE    | Configured source API service.                                                                                          |
| SOURCE_ENVIRONMENT    | Configured development or production value.                                                                             |
| EXPECTED_SUBSCRIPTION | Full source subscription name.                                                                                          |
| QUARANTINE_TOPIC      | Full quarantine topic name.                                                                                             |
| DISCORD_WEBHOOK_URL   | Injected by Secret Manager at the selected numeric version. It is never placed in config, logs, or quarantine messages. |

## Register the actual Discord webhook

The repository does not contain a working Discord webhook URL. Before applying
the relay, an operator must create a webhook for the intended Discord channel,
then store its full URL as a version of a Secret Manager secret in
`gcp.projectId`. Use separate webhook URLs and secrets for development and
production. Treat the URL as a credential: do not put it in the JSON config,
Git, PR text, build arguments, or logs.

In an operator-only copy of the config, set `secret.name` to that existing
Secret Manager secret and `secret.version` to its enabled numeric version (for
example, `1`). The example's `discord-webhook:1` is a placeholder, not a
provisioned webhook. The deployment preflight checks that the selected version
exists and is `ENABLED`; it does not create the secret or upload the URL.

During `--apply`, the deploy helper grants the relay runtime service account
`roles/secretmanager.secretAccessor` on the selected secret and deploys Cloud Run
with `--set-secrets=DISCORD_WEBHOOK_URL=<secret.name>:<secret.version>`. The
alerting process reads that injected environment variable at startup. Inspect
the Cloud Run revision's secret reference and selected version without printing
the webhook value. A real delivery test requires a separate staging webhook and
an explicit operator run; a successful plan or image build does not prove that
Discord received a message.

NODE_ENV is owned by the worker image and remains independent of the source
log environment. Cloud Run injects the reserved PORT variable; the deploy
command selects the container port with --port=8080 and does not put PORT in
--set-env-vars.

## Preconditions and inventory

Run the plan and inspect every identifier before using --apply. The closed
preflight requires these APIs to already be enabled:

- artifactregistry.googleapis.com
- cloudbuild.googleapis.com
- iamcredentials.googleapis.com
- logging.googleapis.com
- pubsub.googleapis.com
- run.googleapis.com
- secretmanager.googleapis.com

It also verifies the selected numeric Secret Manager version is ENABLED and
that the source API Cloud Run service exists. The sink filter names the source
service, stdout, severity=ERROR, numeric level=50, the configured environment,
alertEligible=true, schemaVersion=1, and the configured producer. It cannot
match relay logs, which prevents a relay-error feedback loop.

The apply path reconciles the managed source subscription push configuration
and relay service IAM policy, then runs exact postflight checks for all three
subscriptions. It checks the service URL plus push path, the service URL
audience, the dedicated OIDC identity, service-level roles/run.invoker, the
disabled sink, and the missing-eligibility metric. allUsers is not accepted.

The current inventory target supplied for operator review is project workvoys,
API service mogak-spring, region asia-northeast3. These are inventory inputs,
not deployment authorization. Confirm them with read-only commands:

```sh
gcloud run services describe mogak-spring \
  --project=workvoys \
  --region=asia-northeast3 \
  --format='yaml(metadata.name,status.url,spec.template.spec.serviceAccountName)'
gcloud services list \
  --project=workvoys \
  --enabled \
  --format='value(config.name)'
```

Record the output and the owner of each existing resource. Do not infer sink,
topic, subscription, service account, or secret identifiers from labels or
names. The helper always spawns gcloud with argv and shell: false; it does not
evaluate a source .env file.

The helper cannot statically prove that the invoking principal may update every
named resource. A denied describe or IAM policy read stops the run; no fallback
identity or broad role is inferred. Before apply, separately confirm permission
to create service accounts, set IAM bindings, deploy Cloud Run, and manage the
named Logging sink and Pub/Sub resources.

## Build an immutable image

Install dependencies and build from the workspace lockfile:

```sh
pnpm install --filter @mogak/alerting --frozen-lockfile
pnpm --filter @mogak/alerting build
```

Build and push through the manual Cloud Build config with an explicit tag:

```sh
export IMAGE_TAG="relay-20261015-01"
gcloud builds submit . \
  --project="<GCP_PROJECT_ID>" \
  --config=cloudbuild.error-log-relay.yaml \
  --substitutions="_AR_REPOSITORY=<AR_REPOSITORY>,_REGION=<REGION>,_IMAGE_NAME=<IMAGE_NAME>,_IMAGE_TAG=<IMAGE_TAG>"
```

Resolve the pushed tag to a digest and place the full digest in relay.image:

```sh
gcloud artifacts docker images describe \
  "<REGION>-docker.pkg.dev/<GCP_PROJECT_ID>/<AR_REPOSITORY>/<IMAGE_NAME>:<IMAGE_TAG>" \
  --project="<GCP_PROJECT_ID>" \
  --format='value(image_summary.digest)'
```

Do not deploy a mutable tag. The image is built from the root lockfile and
workspace by apps/alerting/Dockerfile.

## Staged deployment and sink activation

Apply the resource plan with the configured sink disabled:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.production.json \
  --apply
```

The command first runs the closed external-prerequisite preflight, then creates
or updates only the named service accounts, topics, subscriptions, relay
service, sink, metric, and IAM bindings. It uses --no-allow-unauthenticated,
service-level run.invoker, and an authenticated Pub/Sub push identity. Source,
quarantine, and DLQ subscriptions retain acknowledged messages for seven days
and never expire. The sink remains disabled while its filter and publisher IAM
are reconciled. A failed postflight stops the apply.

Before activation, send a synthetic event through the selected development or
production path and verify:

- only source ERROR records reach the sink;
- warning, wrong-environment, other-service, malformed, and relay-originated
  records are ignored or quarantined according to the relay contract;
- Discord receives only allowlisted fields;
- a Discord 429 is retried by Pub/Sub after the process-local cooldown;
- permanent Discord failures are written to relay quarantine with safe,
  allowlisted diagnostics and are acknowledged;
- retry exhaustion reaches the native Pub/Sub DLQ, which retains the original
  Cloud Logging record under restricted access and seven-day retention; and
- webhook URLs are absent from logs and relay quarantine diagnostics.

After the staging check is recorded, explicitly activate the configured sink:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.production.json \
  --apply \
  --activate-sink \
  --staging-verified
```

Without both activation flags the sink remains disabled. The plan output shows
the requested final sink setting and places the activation command last. An
existing subscription with a different topic is rejected before any resource
update; preserve that subscription and choose a new configured ID instead of
retargeting it.

The metric is a Cloud Logging counter only. It does not create an alert or a
webhook. Query it and its source records with read-only commands:

```sh
gcloud logging metrics describe "<MISSING_ELIGIBILITY_METRIC>" \
  --project="<GCP_PROJECT_ID>" \
  --format='yaml(name,filter,description)'
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mogak-spring" AND logName="projects/workvoys/logs/run.googleapis.com%2Fstdout" AND severity=ERROR AND jsonPayload.environment="production" AND jsonPayload.producer="mogak-core-api" AND NOT jsonPayload.alertEligible=true AND NOT jsonPayload.alertEligible=false' \
  --project="<GCP_PROJECT_ID>" \
  --limit=20
```

## IAM and owned resources

The desired bindings are intentionally narrow:

- the sink writer identity can publish only to the source topic;
- the relay identity can publish only to the quarantine topic and read the
  named webhook secret;
- the push identity can invoke only the relay Cloud Run service; and
- the Pub/Sub service agent can mint tokens for the push identity, publish to
  the DLQ topic, and consume the source subscription for DLQ delivery
  tracking.

The plan first describes every named resource. Existing resources are updated
only to the desired settings; unrelated topics, subscriptions, services, sinks,
service accounts, and IAM bindings are never enumerated for mutation. If an
existing resource has a different owner or conflicting identity, stop and
resolve ownership before applying.

## Rollback and recovery

To stop external delivery quickly, disable the push path and then disable the
configured sink:

```sh
gcloud pubsub subscriptions modify-push-config \
  "<EXPECTED_SUBSCRIPTION>" \
  --project="<GCP_PROJECT_ID>" \
  --push-auth-service-account="<PUSH_SERVICE_ACCOUNT>" \
  --push-endpoint='' \
  --quiet
gcloud logging sinks update "<SINK_NAME>" \
  --project="<GCP_PROJECT_ID>" \
  --disabled \
  --quiet
```

Use Cloud Logging to find the original errorId and inspect backlog and DLQ
counts. The native Pub/Sub DLQ retains the original source Cloud Logging
record, so restrict operator access and preserve its seven-day retention.
Correct the cause, then manually replay selected messages while preserving
errorId; never paste raw payloads into a webhook or operator ticket. A replay
can produce a duplicate Discord message because delivery is at least once.

Useful read-only checks include:

```sh
gcloud pubsub subscriptions describe "<EXPECTED_SUBSCRIPTION>" --project="<GCP_PROJECT_ID>"
gcloud pubsub subscriptions describe "<DLQ_SUBSCRIPTION>" --project="<GCP_PROJECT_ID>"
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mogak-spring" AND jsonPayload.alertEligible=true' \
  --project="<GCP_PROJECT_ID>" \
  --limit=20
```

Keep the source log and original errorId as the audit record. Relay quarantine
messages and Discord notifications contain only allowlisted fields. The native
Pub/Sub DLQ is the separately restricted seven-day store for the original source
record used for manual replay. Webhook URLs must never appear in any of these
outputs.
