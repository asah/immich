#!/usr/bin/env bash
# Persist the verified image after deployment, using sudo only for the .env update.
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

if [[ "$action" == check ]]; then
  # Authorize and check the privileged update before maintenance begins.
  if (( EUID != 0 )); then
    sudo -v
    sudo test -w "$ENV_FILE"
    sudo test -w "$(dirname "$ENV_FILE")"
  else
    [[ -w "$ENV_FILE" && -w "$(dirname "$ENV_FILE")" ]]
  fi
  echo "Will pin $image after the release checks pass (currently $configured_image)"
  exit 0
fi

if (( EUID != 0 )); then
  # Pass only the deployment paths across sudo; keep Git credentials unprivileged.
  exec sudo env \
    IMMICH_DEPLOY_DIR="$DEPLOY_DIR" \
    IMMICH_COMPOSE_FILE="$COMPOSE_FILE" \
    IMMICH_ENV_FILE="$ENV_FILE" \
    "$0" save "$image"
fi

# Preserve the administrator's ownership and mode with an atomic replacement.
temporary_env="$(mktemp "${ENV_FILE}.XXXXXX")"
trap 'rm -f "$temporary_env"' EXIT
chmod --reference="$ENV_FILE" "$temporary_env"
chown --reference="$ENV_FILE" "$temporary_env"
awk '!/^[[:space:]]*(export[[:space:]]+)?IMMICH_SERVER_IMAGE[[:space:]]*=/' "$ENV_FILE" > "$temporary_env"
printf '\nIMMICH_SERVER_IMAGE=%s\n' "$image" >> "$temporary_env"
mv -f "$temporary_env" "$ENV_FILE"

configured_image="$( (unset IMMICH_SERVER_IMAGE; server_image) )"
[[ "$configured_image" == "$image" ]] || {
  echo "ordinary Compose startup would select $configured_image instead of $image" >&2
  exit 1
}
echo "Pinned ordinary Compose startup to $image"
