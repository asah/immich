#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

action="${1:?enter or exit is required}"
case "$action" in
  enter)
    compose stop immich-server immich-machine-learning
    ;;
  exit)
    compose up -d immich-server immich-machine-learning
    ;;
  *)
    echo "unknown maintenance action: $action" >&2
    exit 1
    ;;
esac
