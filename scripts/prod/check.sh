#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

image="${1:?candidate image is required}"
expected_id="${3:?candidate image ID is required}"
actual_id="$(docker image inspect --format '{{.Id}}' "$image")"
[[ "$actual_id" == "$expected_id" ]] || { echo "candidate image ID changed" >&2; exit 1; }
container_id="$(compose ps -q immich-server)"
[[ -n "$container_id" ]] || { echo "immich-server container is not running" >&2; exit 1; }
container_image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
[[ "$container_image_id" == "$expected_id" ]] || {
  echo "immich-server is running a different image than the candidate" >&2
  exit 1
}
compose exec -T immich-server node -e '
  fetch("http://[::1]:2283/api/server/ping")
    .then(async (response) => {
      if (!response.ok) throw new Error(`unexpected status ${response.status}: ${await response.text()}`);
    })
    .catch((error) => { console.error(error); process.exit(1); });
'
IMMICH_SERVER_IMAGE="$image" compose run --rm --no-deps \
  --entrypoint node immich-server /usr/src/app/server/dist/main.js immich-admin schema-check
