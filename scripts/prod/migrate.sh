#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

image="${1:?candidate image is required}"
compose up -d database redis
IMMICH_SERVER_IMAGE="$image" compose run --rm --no-deps \
  --entrypoint /usr/src/app/server/bin/migrate-v3-production.sh \
  immich-server
