#!/usr/bin/env bash
set -Eeuo pipefail

: "${IMMICH_DEPLOY_DIR:?IMMICH_DEPLOY_DIR is required}"
DEPLOY_DIR="$(readlink -f "$IMMICH_DEPLOY_DIR")"
COMPOSE_FILE="${IMMICH_COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}"
ENV_FILE="${IMMICH_ENV_FILE:-$DEPLOY_DIR/.env}"

[[ -f "$COMPOSE_FILE" ]] || { echo "missing compose file: $COMPOSE_FILE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "missing env file: $ENV_FILE" >&2; exit 1; }

compose() {
  docker compose --project-directory "$DEPLOY_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

load_env() {
  set -a
  # The production .env is administrator-controlled and is never committed.
  source "$ENV_FILE"
  set +a
}
