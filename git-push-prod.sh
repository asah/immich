#!/usr/bin/env bash
# Fail-closed production release for the custom Immich fork.
# Database migrations are forward-only; do not bypass the required hooks below.
set -Eeuo pipefail

REPO="${IMMICH_REPO:-/home/asah/projects/immich}"

die() { echo "ERROR: $*" >&2; exit 1; }
require_hook() {
  local name="$1" path="$2"
  [[ -n "$path" ]] || die "$name must be configured"
  [[ -x "$path" ]] || die "$name is not executable: $path"
}

cd "$REPO"

RELEASE_ENV="${IMMICH_RELEASE_ENV:-$REPO/.prod-release.env}"
[[ -f "$RELEASE_ENV" ]] || die "missing $RELEASE_ENV; copy .prod-release.env.example on the deployment host"
# The deployment-host file contains paths and URLs, never repository secrets.
source "$RELEASE_ENV"

BUILD_CMD="${IMMICH_BUILD_CMD:-$REPO/scripts/prod/build.sh}"
DEPLOY_CMD="${IMMICH_DEPLOY_CMD:-$REPO/scripts/prod/deploy.sh}"
BACKUP_CMD="${IMMICH_BACKUP_CMD:-$REPO/scripts/prod/backup.sh}"
MAINTENANCE_CMD="${IMMICH_MAINTENANCE_CMD:-$REPO/scripts/prod/maintenance.sh}"
MIGRATE_CMD="${IMMICH_MIGRATE_CMD:-$REPO/scripts/prod/migrate.sh}"
CHECK_CMD="${IMMICH_POST_DEPLOY_CHECK_CMD:-$REPO/scripts/prod/check.sh}"
HEALTH_URL="${IMMICH_HEALTH_URL:-}"
LOCK_FILE="${IMMICH_DEPLOY_LOCK_FILE:-/tmp/immich-production-deploy.lock}"
EXPECTED_BRANCH="${IMMICH_PROD_BRANCH:-}"
EXPECTED_REMOTE="${IMMICH_PROD_REMOTE:-origin}"

exec 9>"$LOCK_FILE"
flock -n 9 || die "another production deployment is already running"

[[ -n "$EXPECTED_BRANCH" ]] || die "IMMICH_PROD_BRANCH must name the approved release branch"
[[ "$(git branch --show-current)" == "$EXPECTED_BRANCH" ]] ||
  die "refusing branch $(git branch --show-current); expected $EXPECTED_BRANCH"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short >&2
  die "working tree is dirty; commit changes first"
fi

git remote get-url "$EXPECTED_REMOTE" >/dev/null || die "unknown production remote: $EXPECTED_REMOTE"
git fetch --quiet "$EXPECTED_REMOTE"
SHA="$(git rev-parse HEAD)"
SHORT_SHA="${SHA:0:12}"
IMAGE="immich-custom:${SHORT_SHA}"

require_hook IMMICH_BUILD_CMD "$BUILD_CMD"
require_hook IMMICH_DEPLOY_CMD "$DEPLOY_CMD"
require_hook IMMICH_BACKUP_CMD "$BACKUP_CMD"
require_hook IMMICH_MAINTENANCE_CMD "$MAINTENANCE_CMD"
require_hook IMMICH_MIGRATE_CMD "$MIGRATE_CMD"
require_hook IMMICH_POST_DEPLOY_CHECK_CMD "$CHECK_CMD"
[[ -n "$HEALTH_URL" ]] || die "IMMICH_HEALTH_URL must be the production /api/server/ping URL"

echo "Commit: $SHA"
echo "Image : $IMAGE"

echo "[1/8] Verifying release metadata..."
# The production host need not (and commonly must not) have the development
# Node/Pnpm toolchain. The candidate Docker build performs server and web
# compilation in its pinned build environment; migration validation runs in
# the candidate image at step 6.
git diff --check

echo "[2/8] Building..."
previous_image_id="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || true)"
"$BUILD_CMD" "$SHA"
docker image inspect "$IMAGE" >/dev/null 2>&1 || die "expected image not found: $IMAGE"
image_id="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
[[ "$image_id" != "$previous_image_id" ]] || die "builder did not replace existing image: $IMAGE"
image_source="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$IMAGE" | sed -n 's/^IMMICH_SOURCE_COMMIT=//p')"
[[ "$image_source" == "$SHA" ]] || die "image provenance mismatch: expected $SHA, found ${image_source:-unset}"

echo "[3/8] Publishing exact commit..."
git push --porcelain "$EXPECTED_REMOTE" "HEAD:refs/heads/$EXPECTED_BRANCH"
[[ "$(git ls-remote "$EXPECTED_REMOTE" "refs/heads/$EXPECTED_BRANCH" | awk '{print $1}')" == "$SHA" ]] ||
  die "production remote does not resolve $EXPECTED_BRANCH to $SHA"

echo "[4/8] Entering maintenance mode..."
# Must stop/scale API and workers while leaving PostgreSQL available.
"$MAINTENANCE_CMD" enter "$SHA" "$IMAGE" "$image_id"
maintenance_entered=true
trap 'if [[ "${maintenance_entered:-false}" == true ]]; then echo "ERROR: maintenance remains active; do not image-roll back. Restore the verified backup if recovery is needed." >&2; fi' ERR

echo "[5/8] Backing up the quiescent production DB..."
# Hook must print one absolute, readable backup path only after restore verification.
backup_artifact="$("$BACKUP_CMD" "$SHA" "$IMAGE" "$image_id")"
[[ "$backup_artifact" = /* && -f "$backup_artifact" ]] || die "backup hook did not return a readable absolute artifact path"
sha256sum "$backup_artifact" >/dev/null || die "could not checksum backup artifact"

echo "[6/8] Reconciling migration history and migrating..."
# Must use THIS image and production DB_URL, before a v3.2 server starts:
#   migrations:reconcile-v3-history; then normal Immich migrations under its lock.
# It must also run schema-check and fail on drift. Do not replace this with app startup.
"$MIGRATE_CMD" "$IMAGE" "$SHA" "$image_id"

echo "[7/8] Deploying..."
"$DEPLOY_CMD" "$IMAGE" "$SHA" "$image_id"

echo "[8/8] Checking production..."
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
    # Must verify container image/digest, migration state, schema, and smoke endpoints.
    "$CHECK_CMD" "$IMAGE" "$SHA" "$image_id" "$backup_artifact"
    "$MAINTENANCE_CMD" exit "$SHA" "$IMAGE" "$image_id"
    maintenance_entered=false
    echo "DEPLOYED AND VERIFIED: $SHA"
    echo "Rollback requires restoring the verified DB backup from step 4; an image-only rollback is unsafe."
    exit 0
  fi
  sleep 2
done

die "health check never returned 2xx; keep maintenance mode and restore the verified backup if required"
