#!/usr/bin/env bash
# Run once from the candidate image, with DB_URL set to the production database.
# This intentionally does not start the API server.
set -Eeuo pipefail

SERVER_HOME="$(readlink -f "$(dirname "$0")/..")"

if [[ -z "${DB_URL:-}" ]]; then
  : "${DB_USERNAME:=postgres}"
  : "${DB_PASSWORD:?DB_URL or DB_PASSWORD is required}"
  : "${DB_DATABASE_NAME:=immich}"
  : "${DB_HOSTNAME:=database}"
  : "${DB_PORT:=5432}"
  DB_URL="$(node -e 'const [user,password,host,port,database]=process.argv.slice(1); const url=new URL(`postgres://${host}:${port}/${database}`); url.username=user; url.password=password; process.stdout.write(url.href)' "$DB_USERNAME" "$DB_PASSWORD" "$DB_HOSTNAME" "$DB_PORT" "$DB_DATABASE_NAME")"
  export DB_URL
fi

node "$SERVER_HOME/dist/bin/reconcile-v3-migration-history.js"
node "$SERVER_HOME/node_modules/@immich/sql-tools/dist/cli.js" -u "$DB_URL" migrations run
node "$SERVER_HOME/dist/main.js" immich-admin schema-check
