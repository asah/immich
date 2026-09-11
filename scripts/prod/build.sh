#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:?commit SHA is required}"
repo="$(git rev-parse --show-toplevel)"
image="immich-custom:${sha:0:12}"

docker build \
  --build-arg "BUILD_SOURCE_COMMIT=$sha" \
  --build-arg "BUILD_SOURCE_REF=$(git branch --show-current)" \
  --tag "$image" \
  --file "$repo/server/Dockerfile" \
  "$repo"
