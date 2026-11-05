#!/usr/bin/env bash
# Verify the administrator's image pin without writing to the deployment directory.
set -Eeuo pipefail
# shellcheck source=scripts/prod/common.sh disable=SC1091
source "$(dirname "$0")/common.sh"

image="${1:?candidate image is required}"

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

# Ignore the caller's environment: an ordinary Compose restart must select the
# same image from the deployment .env file.
configured_image="$( (unset IMMICH_SERVER_IMAGE; compose config --format json) | python3 -c \
  'import json, sys; print(json.load(sys.stdin)["services"]["immich-server"]["image"])')"
[[ "$configured_image" == "$image" ]] || {
  echo "set IMMICH_SERVER_IMAGE=$image in $ENV_FILE before releasing (currently selects $configured_image)" >&2
  exit 1
}
echo "Verified ordinary Compose startup selects $image"
