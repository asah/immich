#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=scripts/prod/common.sh disable=SC1091
source "$(dirname "$0")/common.sh"

image="${1:?candidate image is required}"
IMMICH_SERVER_IMAGE="$image" compose up -d --no-deps immich-server
