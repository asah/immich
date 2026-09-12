#!/usr/bin/env bash
# Complete a deployment left in maintenance only because an external health
# endpoint is protected by a reverse proxy authentication layer.
set -Eeuo pipefail

REPO="${IMMICH_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RELEASE_ENV="${IMMICH_RELEASE_ENV:-$REPO/.prod-release.env}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$RELEASE_ENV" ]] || die "missing $RELEASE_ENV"
source "$RELEASE_ENV"
source "$REPO/scripts/prod/common.sh"

sha="${1:?usage: $0 <commit-sha> <image-tag>}"
image="${2:?usage: $0 <commit-sha> <image-tag>}"
internal_health_url="${IMMICH_INTERNAL_HEALTH_URL:-http://[::1]:2283/api/server/ping}"

image_id="$(docker image inspect --format '{{.Id}}' "$image")" || die "image not found: $image"

echo "Checking Immich API from inside the running server container..."
compose exec -T immich-server node -e '
  const url = process.argv[1];
  fetch(url).then(async (response) => {
    console.log(`${response.status} ${await response.text()}`);
    process.exit(response.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
' "$internal_health_url"

echo "Verifying deployed image and schema..."
"$REPO/scripts/prod/check.sh" "$image" "$sha" "$image_id" manual-health-recovery

echo "Exiting maintenance mode..."
"$REPO/scripts/prod/maintenance.sh" exit "$sha" "$image" "$image_id"

echo "RECOVERED AND VERIFIED: $sha"
