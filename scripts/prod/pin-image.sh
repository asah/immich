#!/usr/bin/env bash
# Persist the verified image without write access to the deployment directory.
set -Eeuo pipefail
# shellcheck source=scripts/prod/common.sh disable=SC1091
source "$(dirname "$0")/common.sh"

action="${1:?check or save is required}"
image="${2:?candidate image is required}"

[[ "$action" == check || "$action" == save ]] || {
  echo "unknown action: $action" >&2
  exit 1
}
[[ "$image" =~ ^immich-custom:[[:xdigit:]]{12}$ ]] || {
  echo "unexpected candidate image tag: $image" >&2
  exit 1
}

server_image() {
  compose config --format json | python3 -c \
    'import json, sys; print(json.load(sys.stdin)["services"]["immich-server"]["image"])'
}

# The deployment Compose file must honor the release's image selection.
configured_image="$(IMMICH_SERVER_IMAGE="$image" server_image)"
[[ "$configured_image" == "$image" ]] || {
  echo "immich-server must use \${IMMICH_SERVER_IMAGE} in the deployment Compose file" >&2
  exit 1
}

# A matching pin needs no write, and an ordinary Compose restart is safe.
configured_image="$( (unset IMMICH_SERVER_IMAGE; server_image) )"
if [[ "$configured_image" == "$image" ]]; then
  echo "Ordinary Compose startup already selects $image"
  exit 0
fi

[[ -r "$ENV_FILE" && -w "$ENV_FILE" ]] || {
  echo "deployment .env must be readable and writable by the release user: $ENV_FILE" >&2
  exit 1
}

if [[ "$action" == check ]]; then
  echo "Will pin $image after the release checks pass (currently $configured_image)"
  exit 0
fi

# Stage and validate the new contents outside the root-owned deployment directory.
# The existing file is replaced in place, preserving its inode, owner, and mode.
temporary_env="$(mktemp /tmp/immich-env-new.XXXXXX)"
backup_env="$(mktemp /tmp/immich-env-backup.XXXXXX)"
write_started=false
write_verified=false
cleanup() {
  local status=$?
  if [[ "$write_started" == true && "$write_verified" != true ]]; then
    if ! cat "$backup_env" > "$ENV_FILE"; then
      echo "could not restore $ENV_FILE from $backup_env; backup retained" >&2
      rm -f "$temporary_env"
      exit "$status"
    fi
  fi
  rm -f "$temporary_env" "$backup_env"
  exit "$status"
}
trap cleanup EXIT

cp -- "$ENV_FILE" "$backup_env"
awk '!/^[[:space:]]*(export[[:space:]]+)?IMMICH_SERVER_IMAGE[[:space:]]*=/' "$backup_env" > "$temporary_env"
printf '\nIMMICH_SERVER_IMAGE=%s\n' "$image" >> "$temporary_env"
staged_image="$( (unset IMMICH_SERVER_IMAGE; ENV_FILE="$temporary_env"; server_image) )"
[[ "$staged_image" == "$image" ]] || {
  echo "staged deployment .env would select $staged_image instead of $image" >&2
  exit 1
}

exec {env_fd}<>"$ENV_FILE"
flock -x "$env_fd"
cmp -s "$ENV_FILE" "$backup_env" || {
  echo "deployment .env changed during the release; refusing to overwrite it" >&2
  exit 1
}
write_started=true
cat "$temporary_env" > "$ENV_FILE"
sync -f "$ENV_FILE"

configured_image="$( (unset IMMICH_SERVER_IMAGE; server_image) )"
[[ "$configured_image" == "$image" ]] || {
  echo "ordinary Compose startup would select $configured_image instead of $image" >&2
  exit 1
}
write_verified=true
exec {env_fd}>&-
echo "Pinned ordinary Compose startup to $image"
