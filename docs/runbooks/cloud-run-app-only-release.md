# Cloud Run app-only release runbook

이 runbook은 `cloudbuild.yaml`의 G1-A 결과를 운영자가 확인하고, 승인된 경우에만 Cloud Run traffic을 전환하는 절차다. 초기 Cloud Build는 `build → push → digest 확인 → no-traffic revision → tagged /health smoke`에서 끝난다.

이 문서의 명령은 Cloud Run traffic과 revision tag만 다룬다. `DATABASE_URL`, Secret Manager secret 원문, Cloud Run Job, `drizzle-kit`, 임의 SQL은 사용하지 않는다.

이 runbook은 IAM을 변경하지 않는다. 실행 주체에는 Artifact Registry Writer, 기존 Cloud Run service 배포 권한, runtime service account에 대한 Service Account User, target preflight용 read 권한, smoke용 `iam.serviceAccounts.getOpenIdToken` 권한(최소 `roles/iam.serviceAccountOpenIdTokenCreator`), 대상 service의 Cloud Run Invoker가 별도로 준비되어 있어야 한다.

## 1. 승인 전 확인

Cloud Build 로그에서 다음 값을 그대로 복사한다. 값을 추측하거나 custom domain으로 바꾸지 않는다. `AR_REPOSITORY`는 trigger의 substitution 설정에서 확인한다.

```text
CLOUD_RUN_SERVICE=<build log value>
CLOUD_RUN_REGION=<build log value>
CLOUD_RUN_REVISION=<build log value>
CLOUD_RUN_TAG=<build log value>
CLOUD_RUN_SMOKE_URL=<build log value>
CLOUD_RUN_IMAGE=<build log value>
AR_REPOSITORY=<trigger substitution value>
```

예상되는 값의 형태는 다음과 같다.

```text
PROJECT_ID="workvoys"
AR_REPOSITORY="<trigger substitution value>"
REGION="<CLOUD_RUN_REGION>"
SERVICE="<CLOUD_RUN_SERVICE>"
REVISION="<CLOUD_RUN_REVISION>"
TAG="<CLOUD_RUN_TAG>"
SMOKE_URL="<CLOUD_RUN_SMOKE_URL>"
```

다음 read-only 확인이 모두 성공해야 한다. service와 repository가 지정한 region에 없으면 중단한다.

```bash
set -euo pipefail
gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --project="$PROJECT_ID" \
  --location="$REGION"
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='yaml(metadata.name,status.url,status.traffic,status.latestCreatedRevisionName)'
gcloud run revisions describe "$REVISION" \
  --project="$PROJECT_ID" \
  --region="$REGION"
```

tagged URL smoke는 Cloud Run service URL을 audience로 사용한다. custom domain은 audience로 사용하지 않는다.

```bash
set -euo pipefail
SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"
TOKEN="$(gcloud auth print-identity-token --audiences="$SERVICE_URL")"
curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 20 \
  --header "Authorization: Bearer $TOKEN" \
  "$SMOKE_URL" \
  | grep -Fx '{"status":"ok"}'
```

smoke가 실패하면 여기서 종료한다. 초기 CD가 `--no-traffic`으로 배포했으므로 기존 serving revision은 그대로 둔다.

## 2. traffic 전환

아래 절차는 운영자 승인이 확인된 뒤에만 실행한다. 이 명령이 이 runbook의 첫 번째 Cloud Run 상태 변경이다.

초기 운영 정책은 기존 traffic이 단일 revision에 100%인 경우만 지원한다. traffic split이나 tag-based traffic이 이미 있으면 현재 traffic map을 별도로 보존한 뒤 중단하고, 임의로 100% 전환하지 않는다.

```bash
PREVIOUS_REVISION="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.traffic.filter(percent=100).revisionName)')"
test -n "$PREVIOUS_REVISION"
test "$PREVIOUS_REVISION" != "$REVISION"
```

승인자가 `SERVICE`, `REGION`, `REVISION`, `TAG`, `PREVIOUS_REVISION`을 다시 확인한 뒤 candidate revision으로 traffic을 전환한다.

```bash
gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-tags="$TAG=100" \
  --quiet
```

전환 직후 같은 tagged URL로 다시 smoke하고, 실제 traffic map을 기록한다.

```bash
TOKEN="$(gcloud auth print-identity-token --audiences="$SERVICE_URL")"
curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 20 \
  --header "Authorization: Bearer $TOKEN" \
  "$SMOKE_URL" \
  | grep -Fx '{"status":"ok"}'
gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='yaml(status.traffic)'
```

## 3. 앱 rollback

traffic 전환 후 5xx나 계약 오류가 확인되면 DB rollback을 시도하지 않고 application revision만 되돌린다. 이 절차는 초기 CD가 schema·data를 변경하지 않는다는 전제에서만 안전하다.

```bash
gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-revisions="$PREVIOUS_REVISION=100" \
  --quiet
```

rollback 후 새 ID token으로 service URL smoke를 수행하고, candidate revision의 tag와 traffic map을 기록한다.

```bash
TOKEN="$(gcloud auth print-identity-token --audiences="$SERVICE_URL")"
curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 20 \
  --header "Authorization: Bearer $TOKEN" \
  "$SERVICE_URL/health" \
  | grep -Fx '{"status":"ok"}'
```

schema·data 변경이 별도로 발견되면 이 runbook의 범위를 벗어나므로 DB owner와 별도 복구 절차를 결정한다.

## 4. tag와 revision 정리

tag는 rollback window 동안 유지한다. 운영자가 보존 기간 종료와 rollback 불필요를 확인한 뒤 tag만 제거한다.

```bash
gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --remove-tags="$TAG" \
  --quiet
```

revision 삭제는 자동화하지 않는다. 삭제하면 해당 revision으로 되돌릴 수 없으므로, 별도 보존 정책과 승인 후에만 수행한다.

관련 설계·구현 기록은 [`ci-cd-github-actions-cloud-run-design.html`](../reviews/ci-cd-github-actions-cloud-run-design.html)과 [`ci-cd-github-actions-cloud-run-implementation.html`](../reviews/ci-cd-github-actions-cloud-run-implementation.html)에서 확인한다.
