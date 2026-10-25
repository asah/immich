#!/usr/bin/env bash
set -Eeuo pipefail
set +x

prompt="${1:-}"
case "$prompt" in
  *"https://github.com'"*|*"https://github.com/"*|*"@github.com'"*|*"@github.com/"*) ;;
  *) exit 1 ;;
esac

case "$prompt" in
  Username*) printf '%s\n' 'x-access-token' ;;
  Password*)
    [[ -n "${IMMICH_GITHUB_DEV_PAT:-}" ]] || exit 1
    printf '%s\n' "$IMMICH_GITHUB_DEV_PAT"
    ;;
  *) exit 1 ;;
esac
