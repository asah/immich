#!/usr/bin/env bash
#
# Immich host + database backup and restore.
#
# SCOPE
#   This script captures the operating system and the Immich PostgreSQL
#   database. The photo library (UPLOAD_LOCATION) is deliberately excluded
#   and is backed up separately.
#
#   The database is dumped before the operating-system archive. This does
#   NOT coordinate the database with the separately backed-up photo library.
#   For the safer consistency direction, snapshot/copy the photo library after
#   this dump, or stop Immich while capturing both database and assets.
#
# BOOTABILITY
#   Filesystems mounted separately from / (typically /boot and /boot/efi)
#   are archived individually, because --one-file-system would otherwise
#   silently skip them and leave a restored host unbootable.
#
SCRIPT_VERSION="2026-07-24.7"
CURRENT_PHASE="early startup"
FAILURE_REPORTED=0
PROGRESS_PID=""
PROGRESS_LABEL=""
PROGRESS_FILE=""
PROGRESS_START=0

# This trap is installed before strict mode or any configuration parsing, so
# even an unexpectedly early failure cannot disappear without an explanation.
on_exit() {
  local status=$?

  trap - EXIT

  if [[ -n "${PROGRESS_PID:-}" ]]; then
    kill "$PROGRESS_PID" >/dev/null 2>&1 || true
    wait "$PROGRESS_PID" >/dev/null 2>&1 || true
  fi

  if declare -F cleanup_partials >/dev/null 2>&1; then
    cleanup_partials || true
  fi

  if (( status != 0 )) && [[ "${FAILURE_REPORTED:-0}" != 1 ]]; then
    printf 'FATAL: %s exited with status %s during: %s\n' \
      "${0:-backup script}" "$status" "${CURRENT_PHASE:-early startup}" >&2
    printf 'Run with DEBUG=YES for shell tracing.\n' >&2
  fi
}
trap on_exit EXIT

if [[ "${DEBUG:-NO}" == YES ]]; then
  PS4='+ ${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]:-main}: '
  set -x
fi

set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/mnt/hd/backup}"
IMMICH_DIR="${IMMICH_DIR:-/opt/immich}"
DB_CONTAINER="${DB_CONTAINER:-immich_postgres}"

# Restore will refuse to touch any other directory unless this is overridden.
EXPECTED_DB_DATA_DIR="${EXPECTED_DB_DATA_DIR:-/opt/immich/postgres}"

# Separately mounted filesystems to archive alongside the root archive.
# Entries that are not their own mount point are skipped (they are already
# inside the root archive).
read -r -a EXTRA_FILESYSTEMS <<<"${EXTRA_FILESYSTEMS-/boot /boot/efi}"

# 0 keeps every backup set. A positive number prunes older complete sets
# after a successful backup.
KEEP_BACKUPS="${KEEP_BACKUPS:-0}"

# /var/lib/docker is excluded by default: copied from a running daemon it
# produces an inconsistent overlay2 tree that can leave Docker unable to
# start after a restore. Images are re-pulled by "docker compose create".
# Caveat: named Docker volumes live there too, so they are NOT backed up.
# Set INCLUDE_DOCKER_LIB=YES to archive it anyway.
INCLUDE_DOCKER_LIB="${INCLUDE_DOCKER_LIB:-NO}"

# Prevent simultaneous backup/restore operations from trampling one another.
LOCK_FILE="${LOCK_FILE:-/run/lock/immich-host-backup.lock}"

# Progress is an honest heartbeat based on compressed bytes written. It does
# not claim a percentage because compression makes that estimate misleading.
SHOW_PROGRESS="${SHOW_PROGRESS:-YES}"
PROGRESS_INTERVAL="${PROGRESS_INTERVAL:-10}"

# pigz produces ordinary gzip streams but compresses in parallel. By default,
# leave two logical CPUs available for PostgreSQL, Docker and filesystem work.
DETECTED_CPU_COUNT="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf 2)"
[[ "$DETECTED_CPU_COUNT" =~ ^[1-9][0-9]*$ ]] || DETECTED_CPU_COUNT=2
CPU_COUNT="${CPU_COUNT:-$DETECTED_CPU_COUNT}"
if [[ "$CPU_COUNT" =~ ^[1-9][0-9]*$ ]] && (( CPU_COUNT > 2 )); then
  DEFAULT_PIGZ_THREADS=$(( CPU_COUNT - 2 ))
else
  DEFAULT_PIGZ_THREADS=1
fi
PIGZ_THREADS="${PIGZ_THREADS:-$DEFAULT_PIGZ_THREADS}"
PIGZ_LEVEL="${PIGZ_LEVEL:-1}"
PIGZ_TAR_COMMAND=""

ID_PATTERN='^[0-9]{8}T[0-9]{6}Z$'

PRESERVED_DB_DIR=""
declare -a PARTIAL_FILES=()

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

say() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARNING: %s\n' "$*" >&2
}

set_phase() {
  CURRENT_PHASE=$1
  say "==> $CURRENT_PHASE"
}

on_err() {
  local status=$?
  local line=${BASH_LINENO[0]:-${LINENO:-unknown}}
  local command=${BASH_COMMAND:-unknown}

  trap - ERR
  FAILURE_REPORTED=1

  printf 'ERROR: command failed during: %s\n' "${CURRENT_PHASE:-unknown phase}" >&2
  printf '       exit status: %s\n' "$status" >&2
  printf '       source line: %s\n' "$line" >&2
  printf '       command: %s\n' "$command" >&2

  exit "$status"
}
trap on_err ERR

die() {
  FAILURE_REPORTED=1
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 ||
    die "Required command not found: $1"
}

require_root() {
  [[ $EUID -eq 0 ]] || die "Run as root or with sudo."
}

acquire_lock() {
  need flock

  mkdir -p -- "$(dirname -- "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another backup or restore operation is already running."
}

validate_backup_settings() {
  [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]] ||
    die "KEEP_BACKUPS must be a nonnegative integer."

  [[ "$PROGRESS_INTERVAL" =~ ^[1-9][0-9]*$ ]] ||
    die "PROGRESS_INTERVAL must be a positive integer."

  [[ "$CPU_COUNT" =~ ^[1-9][0-9]*$ ]] ||
    die "CPU_COUNT must be a positive integer."

  [[ "$PIGZ_THREADS" =~ ^[1-9][0-9]*$ ]] ||
    die "PIGZ_THREADS must be a positive integer."

  [[ "$PIGZ_LEVEL" =~ ^[1-9]$ ]] ||
    die "PIGZ_LEVEL must be between 1 and 9."

  PIGZ_TAR_COMMAND="pigz -${PIGZ_LEVEL} -p ${PIGZ_THREADS}"

  case "$SHOW_PROGRESS" in
    YES|NO) ;;
    *) die "SHOW_PROGRESS must be YES or NO." ;;
  esac
}

cleanup_partials() {
  local file

  if (( ${#PARTIAL_FILES[@]} )); then
    for file in "${PARTIAL_FILES[@]}"; do
      [[ -n "$file" ]] && rm -f -- "$file"
    done
  fi

  PARTIAL_FILES=()
}

track_partial() {
  PARTIAL_FILES+=("$1")
}

human_bytes() {
  local bytes=${1:-0}
  awk -v value="$bytes" 'BEGIN {
    split("B KiB MiB GiB TiB", unit, " ");
    i=1;
    while (value >= 1024 && i < 5) { value /= 1024; i++ }
    if (i == 1) printf "%d%s", value, unit[i];
    else printf "%.1f%s", value, unit[i];
  }'
}

format_elapsed() {
  local seconds=${1:-0}
  printf '%02d:%02d:%02d' \
    $(( seconds / 3600 )) \
    $(( seconds % 3600 / 60 )) \
    $(( seconds % 60 ))
}

progress_snapshot() {
  local prefix=$1
  local now elapsed bytes rate

  now=$(date +%s)
  elapsed=$(( now - PROGRESS_START ))
  bytes=$(stat -c %s -- "$PROGRESS_FILE" 2>/dev/null || printf 0)

  if (( elapsed > 0 )); then
    rate=$(( bytes / elapsed ))
  else
    rate=0
  fi

  printf '%s: %s: %s compressed, %s/s average, elapsed %s\n' \
    "$prefix" "$PROGRESS_LABEL" \
    "$(human_bytes "$bytes")" "$(human_bytes "$rate")" \
    "$(format_elapsed "$elapsed")"
}

start_progress() {
  local label=$1
  local file=$2

  [[ "$SHOW_PROGRESS" == YES ]] || return 0

  PROGRESS_LABEL=$label
  PROGRESS_FILE=$file
  PROGRESS_START=$(date +%s)

  (
    trap - ERR EXIT INT TERM
    set +e
    while :; do
      sleep "$PROGRESS_INTERVAL" || exit 0
      progress_snapshot PROGRESS
    done
  ) &
  PROGRESS_PID=$!
}

stop_progress() {
  [[ -n "${PROGRESS_PID:-}" ]] || return 0

  kill "$PROGRESS_PID" >/dev/null 2>&1 || true
  wait "$PROGRESS_PID" >/dev/null 2>&1 || true
  PROGRESS_PID=""
  progress_snapshot DONE
}

# tar exits 1 for warnings such as "file changed as we read it", which can
# occur while creating a live-system archive. Only backup creation gets this
# tolerance; extraction remains strict.
run_backup_tar() {
  local status=0

  tar "$@" || status=$?

  case $status in
    0)
      ;;
    1)
      warn "tar completed with warning status 1, commonly because live files changed or disappeared while being read."
      ;;
    *)
      die "tar failed with exit status $status"
      ;;
  esac
}

nearest_existing_dir() {
  local path=$1

  while [[ ! -d "$path" && "$path" != / ]]; do
    path=$(dirname -- "$path")
  done

  printf '%s\n' "$path"
}

slug_for_path() {
  local path=${1#/}

  printf '%s\n' "${path//\//_}"
}

validate_id() {
  local id=$1

  [[ "$id" =~ $ID_PATTERN ]] ||
    die "Malformed backup id: '$id' (expected e.g. 20260724T140000Z)"
}

is_intentionally_excluded_mount() {
  local target=$1

  case "$target" in
    /home|/home/*|/mnt|/mnt/*|/media|/media/*|/proc|/proc/*|/sys|/sys/*)
      return 0
      ;;
    /dev|/dev/*|/run|/run/*|/tmp|/tmp/*|/snap|/snap/*)
      return 0
      ;;
    /var/lib/lxcfs|/var/lib/lxcfs/*)
      return 0
      ;;
  esac

  if [[ "$INCLUDE_DOCKER_LIB" != YES ]]; then
    case "$target" in
      /var/lib/docker|/var/lib/docker/*|/var/lib/containerd|/var/lib/containerd/*)
        return 0
        ;;
    esac
  fi

  if [[ -n "${DB_DATA_SOURCE:-}" ]]; then
    case "$target" in
      "$DB_DATA_SOURCE"|"$DB_DATA_SOURCE"/*)
        return 0
        ;;
    esac
  fi

  return 1
}

check_unhandled_mountpoints() {
  local target
  local configured
  local handled

  while IFS= read -r target; do
    [[ "$target" == / ]] && continue
    is_intentionally_excluded_mount "$target" && continue

    handled=0
    for configured in "${EXTRA_FILESYSTEMS[@]}"; do
      if [[ "$target" == "$configured" ]]; then
        handled=1
        break
      fi
    done

    if (( ! handled )); then
      warn "Mounted filesystem $target is not archived by the root tar and is not listed in EXTRA_FILESYSTEMS."
    fi
  done < <(findmnt --real -rn -o TARGET)
}

# ---------------------------------------------------------------------------
# Backup destination checks
# ---------------------------------------------------------------------------

# Verify the backup disk is actually mounted BEFORE creating any directories,
# so we never write a stub tree onto the root filesystem that later hides
# beneath the real mount.
require_backup_filesystem() {
  local base
  local mount_target

  base=$(nearest_existing_dir "$BACKUP_DIR")

  mount_target=$(df --output=target -- "$base" | tail -n1)

  [[ "$mount_target" != / ]] ||
    die "$BACKUP_DIR resolves to the root filesystem. The backup disk is not mounted; refusing to fill /."

  mountpoint -q "$mount_target" ||
    die "$mount_target is not a mount point; refusing to write backups there."

  mkdir -p -- "$BACKUP_DIR"
}

require_free_space() {
  local previous
  local needed=0
  local available
  local file

  if ! previous=$(latest_id_optional); then
    say "No previous backup found; skipping the free space estimate."
    return 0
  fi

  while IFS= read -r file; do
    needed=$(( needed + $(stat -c %s -- "$file") ))
  done < <(
    find "$BACKUP_DIR/$previous" \
      -type f \
      -print
  )

  # Allow 20% headroom over the size of the previous set.
  needed=$(( needed * 12 / 10 ))

  available=$(df -B1 --output=avail -- "$BACKUP_DIR" | tail -n1)

  (( available >= needed )) ||
    die "Only $(( available / 1024 / 1024 )) MiB free in $BACKUP_DIR, need roughly $(( needed / 1024 / 1024 )) MiB. Prune old backups or set KEEP_BACKUPS."
}

# ---------------------------------------------------------------------------
# Database metadata
# ---------------------------------------------------------------------------

container_env() {
  local name=$1

  docker inspect \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    "$DB_CONTAINER" |
    sed -n "s/^${name}=//p" |
    head -n1
}

compose() {
  (
    # Clear the inherited ERR trap so a failure is reported once, by the
    # caller, rather than twice.
    trap - ERR
    cd "$IMMICH_DIR"
    docker compose "$@"
  )
}

prepare_db_metadata() {
  [[ -d "$IMMICH_DIR" ]] ||
    die "Immich directory not found: $IMMICH_DIR"

  # On a freshly restored host, recreate the container definitions
  # without starting the application.
  if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    compose create >/dev/null
  fi

  docker inspect "$DB_CONTAINER" >/dev/null 2>&1 ||
    die "Container not found after docker compose create: $DB_CONTAINER"

  # The "|| true" matters: without it, set -e aborts on a failed lookup and
  # the defaults below would be unreachable.
  DB_USER="${IMMICH_DB_USER:-}"
  [[ -n "$DB_USER" ]] || DB_USER=$(container_env POSTGRES_USER || true)
  DB_USER="${DB_USER:-postgres}"

  DB_NAME="${IMMICH_DB_NAME:-}"
  [[ -n "$DB_NAME" ]] || DB_NAME=$(container_env POSTGRES_DB || true)
  DB_NAME="${DB_NAME:-immich}"

  DB_DATA_SOURCE="$(
    docker inspect \
      --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{println .Source}}{{end}}{{end}}' \
      "$DB_CONTAINER" |
      head -n1
  )"

  [[ -n "$DB_DATA_SOURCE" ]] ||
    die "Could not locate the host mount for /var/lib/postgresql/data"
}

# ---------------------------------------------------------------------------
# Backup set paths
# ---------------------------------------------------------------------------

paths_for_id() {
  local id=$1

  validate_id "$id"

  SET_DIR="$BACKUP_DIR/$id"
  ROOT_ARCHIVE="$SET_DIR/root-${id}.tar.gz"
  DB_DUMP="$SET_DIR/immich-db-${id}.sql.gz"
  CHECKSUM_FILE="$SET_DIR/checksums-${id}.sha256"
  MANIFEST_FILE="$SET_DIR/manifest-${id}.txt"
  MOUNTS_FILE="$SET_DIR/mounts-${id}.txt"
  COMPLETE_FILE="$SET_DIR/complete-${id}.ok"
}

latest_id_optional() {
  local id
  local latest=""

  [[ -d "$BACKUP_DIR" ]] || return 1

  while IFS= read -r id; do
    [[ "$id" =~ $ID_PATTERN ]] || continue
    [[ -f "$BACKUP_DIR/$id/complete-${id}.ok" ]] || continue
    latest=$id
  done < <(
    find "$BACKUP_DIR" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -printf '%f\n' 2>/dev/null |
      sort
  )

  [[ -n "$latest" ]] || return 1
  printf '%s\n' "$latest"
}

latest_id() {
  latest_id_optional ||
    die "No complete backup sets found in $BACKUP_DIR"
}

all_ids() {
  local id

  [[ -d "$BACKUP_DIR" ]] || return 0

  while IFS= read -r id; do
    [[ "$id" =~ $ID_PATTERN ]] || continue
    [[ -f "$BACKUP_DIR/$id/complete-${id}.ok" ]] || continue
    printf '%s\n' "$id"
  done < <(
    find "$BACKUP_DIR" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -printf '%f\n' 2>/dev/null |
      sort
  )
}

# Reads "extra_fs=ARCHIVE|MOUNTPOINT" lines out of a manifest.
manifest_extra_filesystems() {
  local manifest=$1

  [[ -f "$manifest" ]] || return 0

  sed -n 's/^extra_fs=//p' "$manifest"
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

dump_database() {
  local output=$1
  local temporary="${output}.partial"
  local -a statuses
  local pg_status=0
  local pigz_status=0

  rm -f -- "$temporary"
  track_partial "$temporary"

  set_phase "dumping Immich PostgreSQL database"
  say "Database: '$DB_NAME'; container: $DB_CONTAINER"
  start_progress "PostgreSQL dump" "$temporary"

  # No -t: a TTY would corrupt the dump stream. The conditional suppresses
  # the generic ERR trap so we can report which side of the pipeline failed.
  if docker exec -i "$DB_CONTAINER" \
      pg_dump \
        --clean \
        --if-exists \
        --dbname="$DB_NAME" \
        --username="$DB_USER" |
      pigz "-${PIGZ_LEVEL}" -p "$PIGZ_THREADS" >"$temporary"; then
    statuses=(0 0)
  else
    statuses=("${PIPESTATUS[@]}")
  fi

  stop_progress

  pg_status=${statuses[0]:-1}
  pigz_status=${statuses[1]:-1}

  (( pg_status == 0 )) ||
    die "pg_dump failed inside $DB_CONTAINER with exit status $pg_status."

  (( pigz_status == 0 )) ||
    die "pigz failed while writing $temporary with exit status $pigz_status."

  gzip -t "$temporary" || die "The PostgreSQL dump gzip stream is invalid."
  mv -- "$temporary" "$output"
}

archive_extra_filesystem() {
  local mountpoint_path=$1
  local id=$2
  local slug
  local archive
  local temporary
  local fstype
  local -a metadata_options

  slug=$(slug_for_path "$mountpoint_path")
  archive="$SET_DIR/fs_${slug}-${id}.tar.gz"
  temporary="${archive}.partial"

  rm -f -- "$temporary"
  track_partial "$temporary"

  fstype=$(findmnt -no FSTYPE --target "$mountpoint_path" 2>/dev/null || true)

  case "$fstype" in
    vfat|msdos|exfat|ntfs|ntfs3)
      # These filesystems do not support Unix ACLs or xattrs.
      metadata_options=(--numeric-owner)
      ;;
    *)
      metadata_options=(--acls --xattrs --numeric-owner)
      ;;
  esac

  set_phase "archiving separately mounted filesystem $mountpoint_path"
  say "Filesystem type: $fstype"
  start_progress "$mountpoint_path" "$temporary"

  run_backup_tar \
    "${metadata_options[@]}" \
    --one-file-system \
    --sparse \
    --anchored \
    --warning=no-file-changed \
    --warning=no-file-removed \
    --use-compress-program="$PIGZ_TAR_COMMAND" \
    -cpf "$temporary" \
    -C "$mountpoint_path" .

  stop_progress
  gzip -t "$temporary"
  mv -- "$temporary" "$archive"

  EXTRA_ARCHIVES+=("$(basename -- "$archive")|$mountpoint_path")
}

backup() {
  set_phase "starting backup"
  say "Script version: $SCRIPT_VERSION"

  require_root
  acquire_lock
  validate_backup_settings

  need docker
  need tar
  need gzip
  need pigz
  need sha256sum
  need find
  need df
  need stat
  need mountpoint
  need findmnt

  trap 'exit 130' INT
  trap 'exit 143' TERM

  say "Compression: pigz level $PIGZ_LEVEL using $PIGZ_THREADS thread(s)"

  set_phase "checking backup destination and free space"
  require_backup_filesystem
  require_free_space

  set_phase "discovering Immich PostgreSQL configuration"
  prepare_db_metadata

  docker inspect \
    --format '{{.State.Running}}' \
    "$DB_CONTAINER" |
    grep -qx true ||
    die "$DB_CONTAINER is not running"

  local id
  local db_exclude
  local root_temporary
  local db_image
  local mountpoint_path
  local mounts_temporary
  local manifest_temporary
  local checksum_temporary
  local complete_temporary
  local -a excludes

  id=$(date -u +%Y%m%dT%H%M%SZ)
  paths_for_id "$id"

  [[ ! -e "$SET_DIR" ]] ||
    die "Backup set directory already exists: $SET_DIR"
  mkdir -p -- "$SET_DIR"

  EXTRA_ARCHIVES=()

  root_temporary="${ROOT_ARCHIVE}.partial"
  mounts_temporary="${MOUNTS_FILE}.partial"
  manifest_temporary="${MANIFEST_FILE}.partial"
  checksum_temporary="${CHECKSUM_FILE}.partial"
  complete_temporary="${COMPLETE_FILE}.partial"

  track_partial "$root_temporary"
  track_partial "$mounts_temporary"
  track_partial "$manifest_temporary"
  track_partial "$checksum_temporary"
  track_partial "$complete_temporary"

  db_exclude=".${DB_DATA_SOURCE%/}"

  db_image=$(
    docker inspect \
      --format '{{.Config.Image}}' \
      "$DB_CONTAINER"
  )

  # Record the mount layout so a future restore can tell what was captured.
  findmnt --real -no TARGET,SOURCE,FSTYPE,OPTIONS >"$mounts_temporary"
  mv -- "$mounts_temporary" "$MOUNTS_FILE"

  check_unhandled_mountpoints

  # Database first. pg_dump takes a transactionally consistent snapshot.
  dump_database "$DB_DUMP"

  excludes=(
    --exclude='./home'
    --exclude='./mnt'
    --exclude='./media'
    --exclude='./proc'
    --exclude='./sys'
    --exclude='./dev'
    --exclude='./run'
    --exclude='./tmp'
    --exclude='./snap'
    --exclude='./swapfile'
    --exclude='./lost+found'
    --exclude='./var/lib/lxcfs'
    --exclude="$db_exclude"
  )

  if [[ "$INCLUDE_DOCKER_LIB" != YES ]]; then
    excludes+=(
      --exclude='./var/lib/docker'
      --exclude='./var/lib/containerd'
    )
  fi

  set_phase "archiving root filesystem"
  say "Excluding PostgreSQL data at: $DB_DATA_SOURCE"

  if [[ "$INCLUDE_DOCKER_LIB" != YES ]]; then
    say "Excluding /var/lib/docker (images are re-pulled; named volumes are NOT backed up)."
  fi

  start_progress "Root filesystem" "$root_temporary"

  run_backup_tar \
    --acls \
    --xattrs \
    --numeric-owner \
    --one-file-system \
    --sparse \
    --anchored \
    --warning=no-file-changed \
    --warning=no-file-removed \
    "${excludes[@]}" \
    --use-compress-program="$PIGZ_TAR_COMMAND" \
    -cpf "$root_temporary" \
    -C / .

  stop_progress
  gzip -t "$root_temporary"
  mv -- "$root_temporary" "$ROOT_ARCHIVE"

  for mountpoint_path in "${EXTRA_FILESYSTEMS[@]}"; do
    if [[ -d "$mountpoint_path" ]] && mountpoint -q "$mountpoint_path"; then
      archive_extra_filesystem "$mountpoint_path" "$id"
    else
      say "Skipping $mountpoint_path (not a separate mount point)."
    fi
  done

  {
    printf 'backup_id=%s\n' "$id"
    printf 'created_utc=%s\n' "$(date -u --iso-8601=seconds)"
    printf 'hostname=%s\n' "$(hostname -f 2>/dev/null || hostname)"
    printf 'root_archive=%s\n' "$(basename -- "$ROOT_ARCHIVE")"
    printf 'database_dump=%s\n' "$(basename -- "$DB_DUMP")"
    printf 'db_container=%s\n' "$DB_CONTAINER"
    printf 'db_image=%s\n' "$db_image"
    printf 'db_name=%s\n' "$DB_NAME"
    printf 'db_user=%s\n' "$DB_USER"
    printf 'excluded_db_data=%s\n' "$DB_DATA_SOURCE"
    printf 'docker_lib_included=%s\n' "$INCLUDE_DOCKER_LIB"

    local entry
    for entry in "${EXTRA_ARCHIVES[@]}"; do
      printf 'extra_fs=%s\n' "$entry"
    done
  } >"$manifest_temporary"
  mv -- "$manifest_temporary" "$MANIFEST_FILE"

  (
    cd "$SET_DIR"

    {
      sha256sum "$(basename -- "$ROOT_ARCHIVE")"
      sha256sum "$(basename -- "$DB_DUMP")"
      sha256sum "$(basename -- "$MANIFEST_FILE")"
      sha256sum "$(basename -- "$MOUNTS_FILE")"

      local entry
      for entry in "${EXTRA_ARCHIVES[@]}"; do
        sha256sum "${entry%%|*}"
      done
    } >"$(basename -- "$checksum_temporary")"

    mv -- \
      "$(basename -- "$checksum_temporary")" \
      "$(basename -- "$CHECKSUM_FILE")"

    sha256sum -c "$(basename -- "$CHECKSUM_FILE")"
  )

  printf 'complete\n' >"$complete_temporary"
  mv -- "$complete_temporary" "$COMPLETE_FILE"

  PARTIAL_FILES=()
  trap - INT TERM

  prune_old_backups "$id"

  say
  say "Backup complete: $id"

  find "$SET_DIR" \
    -maxdepth 1 \
    -type f \
    -exec ls -lh -- {} +
}

prune_old_backups() {
  local keep_id=$1
  local -a ids
  local id
  local count
  local index

  (( KEEP_BACKUPS > 0 )) || return 0

  mapfile -t ids < <(all_ids)
  count=${#ids[@]}

  (( count > KEEP_BACKUPS )) || return 0

  for (( index = 0; index < count - KEEP_BACKUPS; index++ )); do
    id=${ids[index]}

    [[ "$id" != "$keep_id" ]] || continue
    validate_id "$id"

    say "Pruning old backup set: $id"

    [[ "$BACKUP_DIR/$id" != "$BACKUP_DIR" && "$BACKUP_DIR/$id" != / ]] ||
      die "Refusing unsafe prune path: $BACKUP_DIR/$id"

    rm -rf -- "$BACKUP_DIR/$id"
  done
}

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

verify() {
  require_root

  need tar
  need gzip
  need sha256sum

  local id=${1:-}
  local archive

  [[ -n "$id" ]] || id=$(latest_id)

  paths_for_id "$id"

  [[ -f "$COMPLETE_FILE" ]] ||
    die "Backup set $id is incomplete or missing its completion marker: $COMPLETE_FILE"

  [[ -f "$ROOT_ARCHIVE" ]] ||
    die "Missing root archive: $ROOT_ARCHIVE"

  [[ -f "$DB_DUMP" ]] ||
    die "Missing database dump: $DB_DUMP"

  [[ -f "$CHECKSUM_FILE" ]] ||
    die "Missing checksum file: $CHECKSUM_FILE"

  say "Checking SHA-256 hashes ..."

  (
    cd "$SET_DIR"
    sha256sum -c "$(basename -- "$CHECKSUM_FILE")"
  )

  say "Testing database gzip stream ..."
  gzip -t "$DB_DUMP"

  say "Reading archive indexes ..."

  while IFS= read -r archive; do
    say "  $archive"
    tar -tzf "$SET_DIR/$archive" >/dev/null
  done < <(awk '{print $2}' "$CHECKSUM_FILE" | grep '\.tar\.gz$' || true)

  say "Backup set $id verified."
  say
  say "Note: this proves the archives are readable, not that the SQL dump"
  say "restores cleanly. Do a real restore drill into a scratch container"
  say "periodically."
}

verify_before_restore() {
  local id=$1

  if [[ "${SKIP_VERIFY:-NO}" == YES ]]; then
    warn "SKIP_VERIFY=YES: proceeding without checksum verification."
    return 0
  fi

  say "Verifying backup set $id before making any changes ..."
  verify "$id"
  say
}

list_backups() {
  [[ -d "$BACKUP_DIR" ]] ||
    die "Backup directory does not exist: $BACKUP_DIR"

  local id

  while IFS= read -r id; do
    printf '%s/manifest-%s.txt\n' "$id" "$id"
  done < <(all_ids)
}

# ---------------------------------------------------------------------------
# Restore: root filesystem
# ---------------------------------------------------------------------------

is_expected_extra_mount_path() {
  local manifest=$1
  local target_root=$2
  local candidate=$3
  local entry
  local mountpoint_path

  [[ -f "$manifest" ]] || return 1

  while IFS= read -r entry; do
    [[ "$entry" == *'|'* ]] || continue
    mountpoint_path=${entry#*|}
    [[ "$mountpoint_path" == /* ]] || continue

    if [[ "$candidate" == "${target_root%/}${mountpoint_path}" ]]; then
      return 0
    fi
  done < <(manifest_extra_filesystems "$manifest")

  return 1
}

first_unexpected_entry() {
  local directory=$1
  local manifest=$2
  local target_root=$3
  local child
  local logical_path

  while IFS= read -r -d '' child; do
    [[ "$(basename -- "$child")" == lost+found ]] && continue

    # Nested expected filesystems, such as /boot/efi beneath /boot, are not
    # stale content in the containing filesystem.
    if mountpoint -q "$child"; then
      if is_expected_extra_mount_path "$manifest" "$target_root" "$child"; then
        continue
      fi

      logical_path=${child#"${target_root%/}"}
      if [[ "$logical_path" == /* ]] &&
         is_intentionally_excluded_mount "$logical_path"; then
        continue
      fi
    fi

    printf '%s\n' "$child"
    return 0
  done < <(find "$directory" -mindepth 1 -maxdepth 1 -print0)

  return 1
}

validate_manifest_extra_entry() {
  local entry=$1
  local archive_name
  local mountpoint_path

  [[ "$entry" == *'|'* ]] ||
    die "Malformed extra_fs entry in manifest: $entry"

  archive_name=${entry%%|*}
  mountpoint_path=${entry#*|}

  [[ -n "$archive_name" && "$archive_name" != */* ]] ||
    die "Unsafe archive name in manifest: $archive_name"

  [[ "$mountpoint_path" == /* &&
     "$mountpoint_path" != / &&
     "$mountpoint_path" != *'/../'* &&
     "$mountpoint_path" != */.. &&
     "$mountpoint_path" != /.. ]] ||
    die "Unsafe mount path in manifest: $mountpoint_path"
}

preflight_extra_restore_targets() {
  local manifest=$1
  local target_root=$2
  local entry
  local archive_name
  local mountpoint_path
  local archive
  local destination
  local leftovers

  [[ -f "$manifest" ]] || return 0

  while IFS= read -r entry; do
    validate_manifest_extra_entry "$entry"

    archive_name=${entry%%|*}
    mountpoint_path=${entry#*|}
    archive="$SET_DIR/$archive_name"
    destination="${target_root%/}${mountpoint_path}"

    [[ -f "$archive" ]] ||
      die "Manifest references a missing archive: $archive"

    if ! mountpoint -q "$destination"; then
      [[ "${ALLOW_UNMOUNTED_EXTRA_FS:-NO}" == YES ]] ||
        die "$destination is not mounted. Mount the target filesystem there before starting the restore."

      warn "ALLOW_UNMOUNTED_EXTRA_FS=YES: $mountpoint_path will be extracted into the root filesystem rather than a separate mount."
      continue
    fi

    leftovers=$(first_unexpected_entry "$destination" "$manifest" "$target_root" || true)

    if [[ -n "$leftovers" ]]; then
      [[ "${ALLOW_NONEMPTY_EXTRA_FS:-NO}" == YES ]] ||
        die "$destination is not empty (first unexpected entry: $leftovers). Wipe it, or set ALLOW_NONEMPTY_EXTRA_FS=YES."
    fi
  done < <(manifest_extra_filesystems "$manifest")
}

extract_into() {
  local archive=$1
  local destination=$2
  local fstype

  fstype=$(findmnt -no FSTYPE --target "$destination" 2>/dev/null || true)

  case "$fstype" in
    vfat|msdos|exfat|ntfs|ntfs3)
      # These filesystems have no concept of Unix ownership, ACLs or xattrs.
      tar \
        --numeric-owner \
        --no-same-owner \
        --no-same-permissions \
        -xzf "$archive" \
        -C "$destination"
      ;;
    *)
      tar \
        --acls \
        --xattrs \
        --numeric-owner \
        --same-owner \
        -xzpf "$archive" \
        -C "$destination"
      ;;
  esac
}

restore_root() {
  require_root
  acquire_lock

  need tar
  need findmnt
  need mountpoint

  local id=${1:-}
  local target=${2:-}
  local resolved
  local entry
  local archive
  local archive_name
  local mountpoint_path
  local destination
  local leftovers

  [[ -n "$id" && -n "$target" ]] ||
    die "Usage: $0 restore-root BACKUP_ID TARGET_ROOT"

  paths_for_id "$id"

  [[ -f "$ROOT_ARCHIVE" ]] ||
    die "Missing archive: $ROOT_ARCHIVE"

  [[ -d "$target" ]] ||
    die "Target root must already exist and be mounted: $target"

  resolved=$(readlink -m -- "$target")

  if [[ "$resolved" == / && "${ALLOW_LIVE_ROOT_RESTORE:-NO}" != YES ]]; then
    die \
      "Refusing to overwrite the running root. Use rescue media, or deliberately set ALLOW_LIVE_ROOT_RESTORE=YES."
  fi

  if [[ "$resolved" != / ]] && ! mountpoint -q "$resolved"; then
    [[ "${ALLOW_NON_MOUNTPOINT_TARGET:-NO}" == YES ]] ||
      die "$resolved is not a mount point. Mount the target root filesystem there, or set ALLOW_NON_MOUNTPOINT_TARGET=YES."
  fi

  verify_before_restore "$id"

  if [[ "$resolved" != / ]]; then
    leftovers=$(first_unexpected_entry "$resolved" "$MANIFEST_FILE" "$resolved" || true)

    if [[ -n "$leftovers" ]]; then
      [[ "${ALLOW_NONEMPTY_TARGET:-NO}" == YES ]] ||
        die "$resolved is not empty (first unexpected entry: $leftovers). tar merges rather than replaces, which produces a hybrid system. Wipe the target, or set ALLOW_NONEMPTY_TARGET=YES."
    fi
  fi

  # Validate every separately archived filesystem before touching the target.
  # This prevents a missing /boot or /boot/efi mount from being discovered only
  # after the root filesystem has already been partially restored.
  preflight_extra_restore_targets "$MANIFEST_FILE" "$resolved"

  say "Extracting $ROOT_ARCHIVE into $resolved ..."
  extract_into "$ROOT_ARCHIVE" "$resolved"

  if [[ -f "$MANIFEST_FILE" ]]; then
    while IFS= read -r entry; do
      validate_manifest_extra_entry "$entry"

      archive_name=${entry%%|*}
      mountpoint_path=${entry#*|}
      archive="$SET_DIR/$archive_name"
      destination="${resolved%/}${mountpoint_path}"

      [[ -f "$archive" ]] ||
        die "Manifest references a missing archive: $archive"

      mkdir -p -- "$destination"

      if ! mountpoint -q "$destination"; then
        [[ "${ALLOW_UNMOUNTED_EXTRA_FS:-NO}" == YES ]] ||
          die "$destination is not mounted. Mount the target filesystem there before restoring $mountpoint_path."

        warn "ALLOW_UNMOUNTED_EXTRA_FS=YES: extracting $mountpoint_path into the root filesystem rather than a separate mount."
      fi

      say "Extracting $(basename -- "$archive") into $destination ..."
      extract_into "$archive" "$destination"
    done < <(manifest_extra_filesystems "$MANIFEST_FILE")
  else
    warn "No manifest for $id; any separately mounted filesystems were not restored."
  fi

  say
  say "Root extraction complete."
  say
  say "Before booting, check on the restored system:"
  say "  * /etc/fstab UUIDs match the new disks (blkid)"
  say "  * the bootloader is reinstalled (grub-install + update-grub, chrooted)"
  say "  * initramfs is regenerated if the hardware changed"

  if [[ "${INCLUDE_DOCKER_LIB}" != YES ]]; then
    say "  * /var/lib/docker was excluded; Docker will re-pull images, and any"
    say "    named Docker volumes are not present"
  fi

  say
  say "Then boot that system, mount the backup disk, and run:"
  say
  say "  sudo $0 restore-db $id --reset-db"
}

# ---------------------------------------------------------------------------
# Restore: database
# ---------------------------------------------------------------------------

# Moves the existing PostgreSQL data directory aside instead of deleting it,
# so a failed restore is recoverable.
preserve_db_dir() {
  local actual
  local expected
  local depth

  actual=$(readlink -m -- "$DB_DATA_SOURCE")
  expected=$(readlink -m -- "$EXPECTED_DB_DATA_DIR")

  [[ "$actual" == "$expected" ]] ||
    die \
      "Refusing to touch unexpected database path '$actual'. Expected '$expected'. Override EXPECTED_DB_DATA_DIR only after inspecting the Docker mounts."

  [[ "$actual" != / &&
     "$actual" != /opt &&
     "$actual" != /opt/immich ]] ||
    die "Unsafe database path: $actual"

  depth=$(tr -cd / <<<"$actual" | wc -c)

  (( depth >= 2 )) ||
    die "Refusing to touch a top-level path: $actual"

  if mountpoint -q "$actual"; then
    die "$actual is itself a mount point and cannot be renamed. Move its contents aside manually, then re-run."
  fi

  if [[ -d "$actual" ]]; then
    PRESERVED_DB_DIR="${actual}.old-$(date -u +%Y%m%dT%H%M%SZ)"

    [[ ! -e "$PRESERVED_DB_DIR" ]] ||
      die "Path already exists: $PRESERVED_DB_DIR"

    say "Preserving the current database directory as:"
    say "  $PRESERVED_DB_DIR"

    mv -- "$actual" "$PRESERVED_DB_DIR"
  fi

  mkdir -p -- "$actual"
  chmod 700 -- "$actual"
}

db_restore_failed() {
  local status=$?

  # Avoid recursively invoking this handler if cleanup itself encounters an
  # error, and ensure PostgreSQL is not left running on a failed new cluster.
  trap - ERR EXIT
  docker stop "$DB_CONTAINER" >/dev/null 2>&1 || true

  printf '\n' >&2
  printf 'RESTORE FAILED (exit status %s).\n' "$status" >&2
  printf 'The Immich stack and PostgreSQL container are stopped.\n' >&2

  if [[ -n "$PRESERVED_DB_DIR" ]]; then
    printf 'Your previous database was preserved at:\n' >&2
    printf '  %s\n' "$PRESERVED_DB_DIR" >&2
    printf 'To roll back:\n' >&2
    printf '  rm -rf -- %q\n' "$DB_DATA_SOURCE" >&2
    printf '  mv -- %q %q\n' "$PRESERVED_DB_DIR" "$DB_DATA_SOURCE" >&2
    printf '  cd %q && docker compose up -d\n' "$IMMICH_DIR" >&2
  fi

  exit "$status"
}

restore_db() {
  require_root
  acquire_lock

  need docker
  need gzip
  need sed
  need find
  need mountpoint

  local id=${1:-}
  local confirmation=${2:-}
  local ready=0

  [[ -n "$id" && "$confirmation" == "--reset-db" ]] ||
    die "Usage: $0 restore-db BACKUP_ID --reset-db"

  paths_for_id "$id"

  [[ -f "$DB_DUMP" ]] ||
    die "Missing database dump: $DB_DUMP"

  verify_before_restore "$id"

  prepare_db_metadata

  say "Database target: $DB_NAME"
  say "Database user:   $DB_USER"
  say "Data directory:  $DB_DATA_SOURCE (will be renamed aside, not deleted)"
  say

  trap db_restore_failed ERR EXIT

  # Not "docker compose down -v": that would also destroy named volumes.
  compose down

  preserve_db_dir

  compose create >/dev/null
  docker start "$DB_CONTAINER" >/dev/null

  say "Waiting for PostgreSQL ..."

  for _ in $(seq 1 120); do
    if docker exec "$DB_CONTAINER" \
      pg_isready \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        >/dev/null 2>&1; then

      ready=1
      break
    fi

    sleep 1
  done

  (( ready == 1 )) ||
    die "PostgreSQL did not become ready"

  say "Restoring $DB_DUMP ..."

  # The search_path rewrite and the single transaction are Immich's
  # documented restore procedure. ON_ERROR_STOP plus --single-transaction
  # means a partial restore rolls back rather than leaving a broken schema.
  gzip -dc "$DB_DUMP" |
    sed \
      "s/SELECT pg_catalog.set_config('search_path', '', false);/SELECT pg_catalog.set_config('search_path', 'public, pg_catalog', true);/g" |
    docker exec -i "$DB_CONTAINER" \
      psql \
        --dbname="$DB_NAME" \
        --username="$DB_USER" \
        --single-transaction \
        --set ON_ERROR_STOP=on

  compose up -d

  trap on_err ERR
  trap on_exit EXIT

  say
  say "Database restore complete."
  say "Check Immich with:"
  say
  say "  cd '$IMMICH_DIR' && docker compose ps"

  if [[ -n "$PRESERVED_DB_DIR" ]]; then
    say
    say "Once Immich is confirmed healthy, remove the old data directory:"
    say
    say "  sudo rm -rf -- '$PRESERVED_DB_DIR'"
  fi
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

usage() {
  cat <<USAGE
Usage:
  $0 --version
  $0 backup
  $0 verify [BACKUP_ID]
  $0 list
  $0 restore-root BACKUP_ID TARGET_ROOT
  $0 restore-db BACKUP_ID --reset-db

Examples:
  sudo $0 backup
  sudo $0 verify
  sudo $0 list

  sudo $0 restore-root \\
    20260724T140000Z \\
    /mnt/restored-root

  sudo $0 restore-db \\
    20260724T140000Z \\
    --reset-db

Environment overrides:
  BACKUP_DIR               parent directory; each set is stored in BACKUP_DIR/ID
  IMMICH_DIR, DB_CONTAINER, EXPECTED_DB_DATA_DIR, LOCK_FILE
  SHOW_PROGRESS           YES (default) or NO
  PROGRESS_INTERVAL       heartbeat interval in seconds (default 10)
  PIGZ_THREADS            parallel compression threads (default CPUs minus 2)
  PIGZ_LEVEL              gzip compression level 1-9 (default 1)
  CPU_COUNT               override detected logical CPU count
  DEBUG                   YES to enable bash xtrace
  EXTRA_FILESYSTEMS        default "/boot /boot/efi"
  KEEP_BACKUPS             0 = keep every set (default)
  INCLUDE_DOCKER_LIB       YES to archive /var/lib/docker
  SKIP_VERIFY              YES to restore without checksum verification
  ALLOW_LIVE_ROOT_RESTORE, ALLOW_NON_MOUNTPOINT_TARGET, ALLOW_NONEMPTY_TARGET
  ALLOW_UNMOUNTED_EXTRA_FS YES only to restore a separately archived filesystem
                           into an unmounted directory on the target root
  ALLOW_NONEMPTY_EXTRA_FS YES only to merge into nonempty /boot-style targets

If a restore-db run fails partway and you need to inspect the database
manually, set DB_SKIP_MIGRATIONS=true in the Immich environment first so the
server does not run migrations against a half-restored schema.
USAGE
}

case "${1:-}" in
  --version|-V|version)
    printf '%s\n' "$SCRIPT_VERSION"
    ;;

  backup)
    shift
    backup "$@"
    ;;

  verify)
    shift
    verify "$@"
    ;;

  list)
    shift
    list_backups "$@"
    ;;

  restore-root)
    shift
    restore_root "$@"
    ;;

  restore-db)
    shift
    restore_db "$@"
    ;;

  *)
    usage
    exit 2
    ;;
esac
