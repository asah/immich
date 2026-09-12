#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

action="${1:?enter or exit is required}"
image="${3:?candidate image is required}"
case "$action" in
  enter)
    compose stop immich-server immich-machine-learning
    ;;
  exit)
    # Keep the server on the candidate image selected by the release. Without
    # this, Compose expands its default image value and can silently replace
    # the newly deployed server with an older image during maintenance exit.
    IMMICH_SERVER_IMAGE="$image" compose up -d --no-deps immich-server
    compose up -d immich-machine-learning
    ;;
  *)
    echo "unknown maintenance action: $action" >&2
    exit 1
    ;;
esac
