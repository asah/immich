#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/common.sh"

sha="${1:?commit SHA is required}"
backup_dir="${IMMICH_BACKUP_DIR:?IMMICH_BACKUP_DIR is required}"
load_env
mkdir -p "$backup_dir"
backup="$(readlink -m "$backup_dir/immich-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump")"

# pg_dump's custom format is checked immediately; stdout is reserved for its path.
compose exec -T database pg_dump -U "$DB_USERNAME" -Fc "$DB_DATABASE_NAME" >"$backup"
database_container="$(compose ps -q database)"
[[ -n "$database_container" ]] || { echo "database container is not running" >&2; exit 1; }
archive_in_container="/tmp/$(basename "$backup")"
docker cp "$backup" "$database_container:$archive_in_container"
compose exec -T database pg_restore -l "$archive_in_container" >/dev/null
compose exec -T database rm -f "$archive_in_container"
printf '%s\n' "$backup"
