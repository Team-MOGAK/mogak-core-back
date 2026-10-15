# Error log Discord relay runbook

This runbook operates the independent `@mogak/error-log-relay` service. It
does not send a webhook from the API process. The API writes structured JSON to
Cloud Run stdout; a narrowly filtered Cloud Logging sink copies eligible
production `ERROR` records to Pub/Sub; the relay validates and forwards an
allowlisted message. Pub/Sub delivery is at least once, so the same `errorId`
can be observed more than once after an ACK or network failure.

The deployment helper is intentionally plan first:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.example.json \
  --plan
```

`--plan` is also the default. It prints read-only preflight checks and
shell-free `gcloud` argv arrays. It makes no GCP calls. The example values are
safe placeholders; `my-mogak-project`, the service accounts, topic IDs, sink
ID, secret name/version, database, and immutable image digest must be replaced
by the operator before an apply.

## Configuration contract

`infra/error-log-relay/config.example.json` is the complete configuration
shape. Copy it to an operator-only file and fill every identifier. Keep the
file out of commits if it contains environment-specific identifiers.

| Key                              | Contract                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `gcp.projectId`                  | Existing project that owns the API and relay resources.                                                                                     |
| `gcp.region`                     | Cloud Run, Firestore, Artifact Registry, and Pub/Sub operator region.                                                                       |
| `source.apiService`              | Existing API Cloud Run service (`mogak-spring` in the example). It must differ from the relay service.                                      |
| `source.environment`             | Fixed to `production` for this sink.                                                                                                        |
| `source.producer`                | API log producer identifier (`mogak-core-api` in the example).                                                                              |
| `relay.service`                  | Separate relay Cloud Run service.                                                                                                           |
| `relay.image`                    | Immutable Artifact Registry image ending in `@sha256:<64 hex digits>`. A placeholder is accepted for a plan and rejected by `--apply`.      |
| `relay.serviceAccount`           | Dedicated runtime identity used only by the relay.                                                                                          |
| `relay.pushServiceAccount`       | Dedicated Pub/Sub OIDC identity, distinct from the runtime identity.                                                                        |
| `firestore.databaseId`           | Existing non-`(default)` database dedicated to channel state. The deploy helper never creates it.                                           |
| `firestore.channelDocumentPath`  | `alertChannels/production-discord` or another two-segment document path.                                                                    |
| `secret.name` / `secret.version` | Existing Secret Manager secret and an enabled numeric version. `latest` is rejected.                                                        |
| `topics.*` / `subscriptions.*`   | Explicit source, quarantine, and DLQ IDs. Each subscription retains acknowledged messages for seven days and has `expiration-period=never`. |
| `expectedSubscription`           | Full source subscription name: `projects/<project>/subscriptions/<id>`.                                                                     |
| `quarantineTopic`                | Full quarantine topic name: `projects/<project>/topics/<id>`.                                                                               |
| `sink.name`                      | Existing or newly owned sink identifier. The default is disabled.                                                                           |
| `sink.metricName`                | Safe Cloud Logging counter metric ID for source `ERROR` records with missing or invalid `alertEligible`.                                    |

The relay runtime receives exactly these environment values from the deploy
plan:

| Environment variable     | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`         | Configured project ID.                                                                          |
| `SOURCE_API_SERVICE`     | Configured source API service.                                                                  |
| `EXPECTED_SUBSCRIPTION`  | Full source subscription name.                                                                  |
| `QUARANTINE_TOPIC`       | Full quarantine topic name.                                                                     |
| `FIRESTORE_DATABASE_ID`  | Dedicated Firestore database ID.                                                                |
| `CHANNEL_DOCUMENT_PATH`  | Channel state document path.                                                                    |
| `DISCORD_SECRET_VERSION` | Numeric selected secret version.                                                                |
| `DISCORD_WEBHOOK_URL`    | Injected by Secret Manager at the selected version; it is never in the config or channel state. |
| `NODE_ENV`               | Fixed to `production`.                                                                          |

Cloud Run injects the reserved `PORT` variable. The deploy command selects the
container port with `--port=8080`; do not put `PORT` in `--set-env-vars`.

## Preconditions and inventory

Run the plan and inspect every identifier before using `--apply`. The apply
path fails closed if any of these checks cannot be proven:

- `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`,
  `firestore.googleapis.com`, `iamcredentials.googleapis.com`,
  `logging.googleapis.com`, `pubsub.googleapis.com`, `run.googleapis.com`,
  and `secretmanager.googleapis.com` are already enabled.
- The named Firestore database exists in the configured location. The helper
  never enables the Firestore API and never creates a database. If the API or
  database is absent, obtain separate cost approval and perform those actions
  manually, then rerun the preflight.
- The channel document already exists and contains valid schema version 1
  state. Initialize it with the channel tool while disabled before the first
  production sink activation.
- The selected Secret Manager version exists and is `ENABLED`. A numeric
  version is required so rotation is observable and deterministic.
- The API Cloud Run source service exists. The sink filter names the API
  service, stdout, `severity=ERROR`, numeric `level=50`,
  `environment="production"`, `alertEligible=true`, and `schemaVersion=1`.
  It also binds the configured producer. It cannot match relay logs, which
  prevents a relay-error feedback loop.
- The apply path repairs the managed source subscription push configuration and
  relay service IAM policy, then runs exact postflight checks for all three
  subscriptions, including topic identity, seven-day retention, and
  `expiration-period=never`. It also checks the service URL plus push path, the
  service URL audience, the dedicated OIDC identity, service-level
  `roles/run.invoker`, the disabled sink resource, and the missing-eligibility
  metric. `allUsers` is not accepted.

The current inventory target supplied for operator review is project
`workvoys`, API service `mogak-spring`, region `asia-northeast3`. These are
inventory inputs, not assumptions that authorize a deployment. Confirm them
with read-only commands before copying values into the production config:

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
topic, subscription, service account, secret, or Firestore identifiers from
labels or names.

The helper checks the Firestore document with the Firestore REST document
endpoint after obtaining a token with `gcloud auth print-access-token`.
`gcloud` is always spawned with argv and `shell: false`; no source `.env` file
is evaluated by the deploy helper.

The Cloud Run service account receives `roles/datastore.user` with a native
Firestore database IAM condition:
`resource.name=="projects/<project>/databases/<database>"`. The database must
remain a separate relay database and the runtime identity must not be reused by
other services. The helper never grants `roles/owner`, `roles/editor`, a
project-wide Secret Manager role, or an automatic broad administrator role.
Existing organization-level policies and permissions are outside this
repository and must be reviewed by the operator.

The helper cannot statically prove that the invoking principal will be allowed
to create or update every named resource. It can prove read access only when a
`gcloud` describe and the Firestore document read succeed. A denied describe,
IAM policy read, or preflight token request stops the run; no fallback identity
or broad role is inferred. Before apply, the operator must separately confirm
permission to create service accounts, set IAM bindings, deploy Cloud Run, and
manage the named Logging sink and Pub/Sub resources.

If preflight reports that Firestore is unavailable, stop and obtain explicit
cost and ownership approval. Those manual commands are intentionally outside
the deploy helper and are not run as part of this repository change:

```sh
gcloud services enable firestore.googleapis.com --project="${GCP_PROJECT_ID}"
gcloud firestore databases create \
  --database="${FIRESTORE_DATABASE_ID}" \
  --location="${REGION}" \
  --type=firestore-native \
  --project="${GCP_PROJECT_ID}"
```

After the database exists, rerun the plan and closed preflight. Do not use the
`(default)` database for relay state.

## Build an immutable image

Install dependencies only in the workspace that owns the relay package:

```sh
pnpm install --filter @mogak/error-log-relay --frozen-lockfile
pnpm --filter @mogak/error-log-relay build
```

Build and push through the manual Cloud Build config. Supply the repository,
region, image name, and one manually chosen image tag explicitly:

```sh
export IMAGE_TAG="relay-20261015-01"
```

```sh
gcloud builds submit . \
  --project="${GCP_PROJECT_ID}" \
  --config=cloudbuild.error-log-relay.yaml \
  --substitutions="_AR_REPOSITORY=${AR_REPOSITORY},_REGION=${REGION},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}"
```

Use the same immutable tag value in both the build and digest lookup;
`_IMAGE_TAG` is required by `cloudbuild.error-log-relay.yaml`.

Resolve the pushed tag to a digest, inspect the digest and image metadata, and
place the full digest in `relay.image`:

```sh
gcloud artifacts docker images describe \
  "${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}" \
  --project="${GCP_PROJECT_ID}" \
  --format='value(image_summary.digest)'
```

Do not deploy a mutable tag. The image was built from the root lockfile and
workspace by `apps/error-log-relay/Dockerfile`; the runtime image is Node 24.

## Channel state operations

The channel tool accepts only identifiers and numeric secret versions. It never
accepts a webhook URL. All mutations use a Firestore transaction and preserve
exactly these fields:

```text
schemaVersion: 1
secretVersion: positive numeric version
disabled: boolean
nextAllowedAt: non-negative milliseconds
leaseToken: nullable UUID
leaseExpiresAt: non-negative milliseconds (0 when leaseToken is null)
```

Initialize once, disabled. Initialization refuses to overwrite an existing
document:

```sh
node infra/error-log-relay/channel.mjs init \
  --config infra/error-log-relay/config.production.json
```

Inspect or change state as follows:

```sh
node infra/error-log-relay/channel.mjs status --config infra/error-log-relay/config.production.json
node infra/error-log-relay/channel.mjs resume --config infra/error-log-relay/config.production.json
node infra/error-log-relay/channel.mjs disable --config infra/error-log-relay/config.production.json
node infra/error-log-relay/channel.mjs cooldown-clear --config infra/error-log-relay/config.production.json
node infra/error-log-relay/channel.mjs secret-version-rotate \
  --secret-version 2 \
  --config infra/error-log-relay/config.production.json
```

Secret rotation is fenced by the lease. Rotation fails while a valid lease is
active; after lease expiry the transaction clears the old lease before writing
the new numeric version. Update Secret Manager first, verify the new version is
`ENABLED`, then update channel state and deploy the runtime using the same
version. Keep the old version enabled until all old revisions have drained and
the new revision is serving; disable or destroy the old version only after that
check. This ordering avoids a post-rotation overlap where a revision references
an unavailable secret.

## Staged deployment and sink activation

Apply the resource plan with the production sink disabled:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.production.json \
  --apply
```

The command first runs the closed external-prerequisite preflight, then creates
or updates only the named service accounts, topics, subscriptions, relay
service, sink, metric, and IAM bindings. It uses
`--no-allow-unauthenticated`, service-level `run.invoker`, and an authenticated
Pub/Sub push identity. It does not create or enable a Firestore database. The
source, quarantine, and DLQ subscriptions are reconciled with
`expiration-period=never`. The sink resource stays disabled while its filter
and publisher IAM are reconciled. Managed subscription and Cloud Run
authentication, sink state, and metric shape are checked after the operations
complete; a failed postflight stops the apply.

Postflight must prove the source subscription's push endpoint is exactly
`<service URL><push path>`, its OIDC audience is exactly the service URL, its
OIDC service account is the dedicated push identity, and the relay service
`roles/run.invoker` binding contains only that identity. It must also prove
that quarantine and native DLQ subscriptions retain acknowledged messages for
seven days, never expire, have no push endpoint, and point to their configured
topics. The disabled sink must target the source topic with the exact source
filter, and the metric must retain the source `ERROR` filter for missing or
invalid `alertEligible`.

Before activation, send a synthetic staging event through the staging path and
verify all of the following: the source filter selects only the API's
structured ERROR records; the relay rejects warn, non-production, other
services, malformed schema, and relay-originated logs; Discord receives only
allowlisted fields; 429 cooldown persists across instances; permanent failures
land in the relay quarantine with allowlisted diagnostics; retry exhaustion
lands in the native Pub/Sub DLQ, which retains the original source Cloud
Logging record under restricted access and seven-day retention; and webhook
URLs are absent from logs and relay quarantine diagnostics.

After the staging check is recorded, explicitly activate the production sink:

```sh
node infra/error-log-relay/deploy.mjs \
  --config infra/error-log-relay/config.production.json \
  --apply \
  --activate-sink \
  --staging-verified
```

Without both activation flags the sink remains disabled. The plan output shows
whether the requested final state is disabled or enabled, and the operation
list places the `--no-disabled` activation command last. Review it before
applying. An existing subscription with a different topic is rejected before
any resource update; preserve that subscription and choose a new configured ID
instead of attempting to retarget it. A failed postflight also prevents the
activation command from running.

The metric is a Cloud Logging counter only. It does not create an alert or a
webhook. Query the metric and its source records with read-only commands:

Set `MISSING_ELIGIBILITY_METRIC` to the configured `sink.metricName` before
running these commands.

```sh
gcloud logging metrics describe "${MISSING_ELIGIBILITY_METRIC}" \
  --project="${GCP_PROJECT_ID}" \
  --format='yaml(name,filter,description)'
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mogak-spring" AND logName="projects/workvoys/logs/run.googleapis.com%2Fstdout" AND severity=ERROR AND jsonPayload.environment="production" AND jsonPayload.producer="mogak-core-api" AND NOT jsonPayload.alertEligible=true AND NOT jsonPayload.alertEligible=false' \
  --project="${GCP_PROJECT_ID}" \
  --limit=20
```

If the metric or postflight filter check fails, inspect the named metric and
sink with `gcloud logging metrics describe` and `gcloud logging sinks describe`,
then rerun the plan. If a subscription topic conflict is reported, inspect
the subscription's immutable `topic` field and resolve ownership or choose a
new ID before applying.

## IAM and owned resources

The desired bindings are intentionally narrow:

- The sink writer identity can publish only to the source topic.
- The relay identity can publish only to the quarantine topic, read the named
  webhook secret, and use the conditional dedicated Firestore database
  boundary described above.
- The push identity can invoke only the relay Cloud Run service.
- The Pub/Sub service agent can mint tokens for the push identity, publish to
  the DLQ topic, and consume the source subscription for DLQ delivery
  tracking.

The plan first describes every named resource. Existing resources are updated
only to the desired settings; unrelated topics, subscriptions, services, sinks,
service accounts, and IAM bindings are never enumerated for mutation. If an
existing resource has a different owner or a conflicting identity, stop and
resolve ownership before applying.

## Rollback and recovery

To stop external delivery quickly, disable the channel and the push path, then
disable the production sink:

```sh
node infra/error-log-relay/channel.mjs disable --config infra/error-log-relay/config.production.json
gcloud pubsub subscriptions modify-push-config \
  "${EXPECTED_SUBSCRIPTION}" \
  --project="${GCP_PROJECT_ID}" \
  --push-auth-service-account="${PUSH_SERVICE_ACCOUNT}" \
  --push-endpoint='' \
  --quiet
gcloud logging sinks update "${SINK_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --disabled \
  --quiet
```

Use Cloud Logging to find the original `errorId` and inspect backlog and DLQ
counts. The native Pub/Sub DLQ retains the original source Cloud Logging
record, so restrict operator access and preserve its seven-day retention.
Correct the cause, then manually replay selected messages while preserving
`errorId`; never paste raw payloads into a webhook or an operator ticket.
There is no automatic infinite replay. A replay can produce a duplicate
Discord message because the system is at least once.

Useful read-only checks include:

```sh
gcloud pubsub subscriptions describe "${EXPECTED_SUBSCRIPTION}" --project="${GCP_PROJECT_ID}"
gcloud pubsub subscriptions describe "${DLQ_SUBSCRIPTION}" --project="${GCP_PROJECT_ID}"
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mogak-spring" AND jsonPayload.alertEligible=true' \
  --project="${GCP_PROJECT_ID}" \
  --limit=20
```

Keep the source log and the original `errorId` as the audit record. Relay
quarantine messages and Discord notifications contain only allowlisted fields.
The native Pub/Sub DLQ is the separately restricted seven-day store for the
original source Cloud Logging record used for manual replay. Webhook URLs must
never appear in any of these outputs. Source logs and their restricted raw
diagnostics remain private GCP records under the approved operator IAM boundary;
they are not copied into Discord or relay quarantine.
