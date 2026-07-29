# Project Memory

This file contains durable collaboration context for work in this repository. Consult it before making project changes.

## Development workflow

- After completing any feature or project change, fully restart both the Immich API and web development servers and verify that both return HTTP 200. Do this before handing the work back; the user should not need to request a restart separately.
- In this Codex development container, PostgreSQL and Redis already run in Docker and expose ports 5432 and 6379 on the Docker host. Start the API locally from `server/` with:
  `DB_HOSTNAME=172.17.0.1 REDIS_HOSTNAME=172.17.0.1 pnpm run start:dev`
- Start the web app locally from `web/` with:
  `pnpm dev --host 0.0.0.0 --port 3000`
- Verify the web app at `http://127.0.0.1:3000/` and the API at `http://127.0.0.1:2283/api/server/ping`.
- Avoid `mise dev` in this environment: the repository Compose stack conflicts with the already-running PostgreSQL port.

## Product direction

- Main search combines photo and album discovery.
- Autocomplete displays up to 10 direct-navigation results with albums first.
- Album autocomplete thumbnails carry an album badge so they remain visually distinct from individual photos.
- Search result controls and chips are left-aligned, with matching albums linked beside the chips.
