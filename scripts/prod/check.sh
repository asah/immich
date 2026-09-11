#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

image="${1:?candidate image is required}"
expected_id="${3:?candidate image ID is required}"
actual_id="$(docker image inspect --format '{{.Id}}' "$image")"
[[ "$actual_id" == "$expected_id" ]] || { echo "candidate image ID changed" >&2; exit 1; }
compose ps --status running immich-server | grep -q immich-server
IMMICH_SERVER_IMAGE="$image" compose run --rm --no-deps \
  --entrypoint node immich-server /usr/src/app/server/dist/main.js immich-admin schema-check
