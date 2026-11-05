#!/usr/bin/env bash
# Persist the verified server image for ordinary `docker compose up` restarts.
set -Eeuo pipefail
# shellcheck source=scripts/prod/common.sh disable=SC1091
source "$(dirname "$0")/common.sh"

action="${1:?check or save is required}"
image="${2:?candidate image is required}"

[[ "$image" =~ ^immich-custom:[[:xdigit:]]{12}$ ]] || {
  echo "unexpected candidate image tag: $image" >&2
  exit 1
}

# The deployment Compose file must actually use IMMICH_SERVER_IMAGE for the
# server service. Otherwise the release hooks may start the wrong image.
configured_image="$(IMMICH_SERVER_IMAGE="$image" compose config --format json | python3 -c \
  'import json, sys; print(json.load(sys.stdin)["services"]["immich-server"]["image"])')"
[[ "$configured_image" == "$image" ]] || {
  echo "immich-server must use \${IMMICH_SERVER_IMAGE} in the deployment Compose file" >&2
  exit 1
}

[[ "$action" == check || "$action" == save ]] || {
  echo "unknown action: $action" >&2
  exit 1
}
[[ -w "$ENV_FILE" && -w "$(dirname "$ENV_FILE")" ]] || {
  echo "deployment .env and its directory must be writable to pin the image" >&2
  exit 1
}
[[ "$action" == check ]] && exit 0

# Write the pin only after the candidate passed migration and health checks.
# Keep the existing env file intact apart from its previous image assignment.
temporary_env="$(mktemp "${ENV_FILE}.XXXXXX")"
trap 'rm -f "$temporary_env"' EXIT
chmod --reference="$ENV_FILE" "$temporary_env"
chown --reference="$ENV_FILE" "$temporary_env"
awk '!/^[[:space:]]*(export[[:space:]]+)?IMMICH_SERVER_IMAGE[[:space:]]*=/' "$ENV_FILE" > "$temporary_env"
printf '\nIMMICH_SERVER_IMAGE=%s\n' "$image" >> "$temporary_env"
mv -f "$temporary_env" "$ENV_FILE"

# Verify the value selected by an unqualified Compose invocation.
configured_image="$( (unset IMMICH_SERVER_IMAGE; compose config --format json) | python3 -c \
  'import json, sys; print(json.load(sys.stdin)["services"]["immich-server"]["image"])')"
[[ "$configured_image" == "$image" ]] || {
  echo "ordinary Compose startup would select $configured_image instead of $image" >&2
  exit 1
}
echo "Pinned ordinary Compose startup to $image"
