#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${IMMICH_REPO:-/home/asah/projects/immich}"
BUILD_CMD="${IMMICH_BUILD_CMD:-/home/asah/bin/immich-build-prod}"
DEPLOY_CMD="${IMMICH_DEPLOY_CMD:-/home/asah/bin/immich-deploy-prod}"

cd "$REPO"

# Refuse to deploy uncommitted changes by accident.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty; commit changes first." >&2
  git status --short >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
SHORT_SHA="${SHA:0:12}"
IMAGE="immich-custom:${SHORT_SHA}"

echo "Commit: $SHA"
echo "Image : $IMAGE"

echo
echo "[1/3] Pushing..."
git push

echo
echo "[2/3] Building..."
"$BUILD_CMD" "$SHA"

docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "ERROR: expected image not found: $IMAGE" >&2
  exit 1
}

echo
echo "[3/3] Deploying..."
sudo "$DEPLOY_CMD" "$IMAGE"

echo
echo "DEPLOYED: $SHA"
