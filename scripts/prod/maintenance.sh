#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=scripts/prod/common.sh disable=SC1091
source "$(dirname "$0")/common.sh"

action="${1:?enter or exit is required}"
image="${3:?candidate image is required}"
case "$action" in
  enter)
    compose stop immich-server immich-machine-learning
    ;;
  exit)
    # Start every configured service, including the proxy and dependencies.
    # Keep the candidate override even though the .env pin was just updated.
    IMMICH_SERVER_IMAGE="$image" compose up -d
    ;;
  *)
    echo "unknown maintenance action: $action" >&2
    exit 1
    ;;
esac
