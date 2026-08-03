# Stories Phase 0: server, data, and security contract

Status: implementation specification

Parent design: [Stories](../stories.md)

Review: [Stories expert review](../reviews/stories-expert-review.md)

## Purpose and resolved choices

This document is the server contract for the first production Stories release. It deliberately resolves choices that the proposal left open:

- A story has one mutable **draft head** and an optional immutable **published revision**. Sharing always renders the published revision. Editing never changes an already shared experience until the owner publishes again.
- All committed revisions are retained and addressable. Restore creates a new revision; it never moves or deletes history.
- Story membership uses the same `owner`, `editor`, and `viewer` meanings as albums. There is exactly one owner. Editors can edit and preview; only the owner publishes, manages members and shared links, transfers ownership, and deletes the story.
- Shared links gain a Story target. They reuse existing keys, slugs, passwords, expiry, and revocation. Story links cannot upload and do not expose EXIF. `allowDownload` controls an explicit original-download endpoint; it does not change rendition access.
- Story media is served through a story-scoped rendition endpoint. Story access never grants ordinary asset API access.
- Page and layer ordering is the order of the persisted arrays. Clients express relative moves and the server rewrites arrays atomically. Fractional keys, `position`, and `zIndex` are not persisted.
- V1 revisions store complete canonical JSON snapshots, compressed by PostgreSQL TOAST. This is intentionally simpler and safer than application-level deltas. Storage quotas warn and reject new edits but never prune history silently.
- V1 is online-first. The client can retain unacknowledged batches locally, but the server provides optimistic concurrency and idempotent replay rather than offline merge.

## Relational schema

Names use the repository's singular table convention. UUID primary keys are generated with the existing SQL-tools decorators; timestamps are `timestamp with time zone`.

### `story`

| Column                | Type         | Constraints and meaning                                                                                                                                              |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid         | primary key                                                                                                                                                          |
| `title`               | varchar(200) | default `Untitled Story`                                                                                                                                             |
| `description`         | text         | default empty string; maximum 10,000 UTF-8 bytes at API boundary                                                                                                     |
| `aspectRatio`         | enum         | `portrait_4_5`, `landscape_16_9`, `square_1_1`; maps to logical page size 800×1000, 1600×900, or 1000×1000 and is immutable after the first non-empty revision in V1 |
| `draftRevisionId`     | uuid         | non-null deferred FK to `story_revision.id`                                                                                                                          |
| `publishedRevisionId` | uuid         | nullable deferred FK to `story_revision.id`                                                                                                                          |
| `createdAt`           | timestamptz  | generated                                                                                                                                                            |
| `updatedAt`           | timestamptz  | trigger-maintained                                                                                                                                                   |
| `deletedAt`           | timestamptz  | nullable soft-delete                                                                                                                                                 |
| `updateId`            | uuid         | existing sync-style update marker; Stories need not join the mobile sync API in V1                                                                                   |

The two revision foreign keys must point to revisions with the same `storyId`. Enforce this with composite unique `(storyId, id)` on `story_revision` and composite FKs `(id, draftRevisionId)` / `(id, publishedRevisionId)`. `publishedRevisionId` changes only through publish or unpublish. A story may not be shared until published.

### `story_user`

| Column                   | Type                            | Constraints and meaning                         |
| ------------------------ | ------------------------------- | ----------------------------------------------- |
| `storyId`                | uuid                            | FK `story`, cascade delete; composite PK        |
| `userId`                 | uuid                            | FK `user`, cascade delete; composite PK         |
| `role`                   | existing `album_user_role_enum` | `owner`, `editor`, `viewer`                     |
| `createdAt`, `updatedAt` | timestamptz                     | generated                                       |
| `createId`, `updateId`   | uuid                            | audit/sync markers consistent with `album_user` |

Add a partial unique index on `storyId WHERE role = 'owner'`. The create transaction inserts the story, its owner row, revision zero, and the draft pointer. V1 does not transfer ownership; adding a second owner is rejected. A later ownership-transfer operation must atomically swap roles.

### `story_revision`

| Column          | Type         | Constraints and meaning                                                                       |
| --------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `id`            | uuid         | primary key                                                                                   |
| `storyId`       | uuid         | FK `story`, cascade delete                                                                    |
| `revision`      | bigint       | monotonically increasing per story, starting at 0; unique with `storyId`                      |
| `schemaVersion` | integer      | document schema version                                                                       |
| `document`      | jsonb        | complete canonical document snapshot                                                          |
| `contentHash`   | bytea        | SHA-256 of canonical JSON serialization                                                       |
| `actorId`       | uuid         | nullable FK user, `SET NULL`; null means system migration                                     |
| `source`        | enum         | `create`, `manual`, `import`, `automatic_draft`, `ai`, `undo`, `redo`, `restore`, `migration` |
| `summary`       | varchar(500) | deterministic server-produced summary, never model prose                                      |
| `name`          | varchar(100) | nullable user-visible restore-point name                                                      |
| `createdAt`     | timestamptz  | generated; unique `(storyId, createdAt, id)` supports timestamp pagination                    |

Revision content and identity are immutable. Naming is mutable metadata and requires editor access; an empty name becomes null. `createdAt` is display time, while `revision` is authoritative ordering. A timestamp lookup chooses the greatest revision with `createdAt <= requested timestamp`, breaking ties by revision.

### `story_asset`

This is the current draft's denormalized reference index, rebuilt in the same transaction as every command batch.

| Column          | Type        | Constraints and meaning                                                   |
| --------------- | ----------- | ------------------------------------------------------------------------- |
| `storyId`       | uuid        | FK story, cascade; composite PK                                           |
| `assetId`       | uuid        | FK asset, cascade; composite PK                                           |
| `roleMask`      | integer     | bit set: placed element, unplaced tray, cover candidate, uploaded sticker |
| `sourceAlbumId` | uuid        | nullable FK album, `SET NULL`; provenance only                            |
| `addedById`     | uuid        | nullable FK user, `SET NULL`                                              |
| `createdAt`     | timestamptz | first reference time                                                      |

Historical revisions do not get `story_asset` rows. Authorization of a historical or published revision reads asset IDs from the validated document and checks the asset table. Add a GIN `jsonb_path_ops` index only if measured historical-reference queries need it; deletion impact initially uses a bounded revision lookup job and the current/published index described below.

### `story_published_asset`

| Column               | Type | Constraints and meaning     |
| -------------------- | ---- | --------------------------- |
| `storyId`, `assetId` | uuid | composite PK; cascading FKs |
| `revisionId`         | uuid | FK revision, cascade        |

This exact allowlist is rebuilt transactionally at publish time and powers shared rendition checks. It prevents a draft-only asset from becoming visible through a story link.

### `story_mutation`

| Column             | Type        | Constraints and meaning                                     |
| ------------------ | ----------- | ----------------------------------------------------------- |
| `storyId`          | uuid        | FK story, cascade; composite unique with `clientMutationId` |
| `clientMutationId` | uuid        | caller-generated idempotency key                            |
| `sessionId`        | uuid        | stable editor-tab ID                                        |
| `clientSequence`   | bigint      | non-negative, unique `(storyId, sessionId, clientSequence)` |
| `baseRevision`     | bigint      | request base                                                |
| `resultRevisionId` | uuid        | FK revision                                                 |
| `requestHash`      | bytea       | canonical command-batch SHA-256                             |
| `response`         | jsonb       | bounded canonical response used for exact replay            |
| `createdAt`        | timestamptz | generated                                                   |

Retrying the same mutation ID and request hash returns the stored response. Reusing either mutation ID or `(sessionId, clientSequence)` with different content returns `409 MUTATION_ID_REUSED`. Retain mutation rows while the story exists; their small bounded response is part of durable recovery.

### AI configuration tables

Secrets do not use `user_metadata` or `system_metadata` JSON.

`ai_provider` stores `id`, nullable `userId` (null means server-wide), provider adapter enum, approved endpoint ID, model, enabled flag, capability flags, encrypted credential ID, created/updated timestamps. A partial unique index permits at most one enabled provider per user and one enabled server provider. Admin policy can disable user overrides.

`ai_credential` stores `id`, nullable `userId`, encrypted bytes, nonce, authentication tag, master-key version, non-secret fingerprint, created/updated timestamps, and last-tested timestamp/status. Encryption is AES-256-GCM (or libsodium XChaCha20-Poly1305 if already adopted project-wide) with associated data containing credential ID, owner scope, and key version. The master key comes only from deployment secret configuration. APIs never return ciphertext, nonce, or secret.

`user_ai_consent` stores `(userId, providerId)`, `textAllowed`, `thumbnailAllowed`, `providerDisclosureHash`, and timestamps. A provider adapter, endpoint, retention disclosure, or material data-category change changes the disclosure hash and requires consent again.

`story_ai_draft` stores `id`, `storyId`, `actorId`, `baseRevision`, `commandSchemaVersion`, canonical command JSON, command hash, compact diff JSON, expiry, created time, and nullable applied revision ID. It contains no credential and no model-supplied URLs.

### Extending `shared_link`

Add nullable `storyId` FK `story` with cascade delete and extend `SharedLinkType` with `story`. Add `startPageId` uuid and `startOffsetMs` integer nullable. Enforce with a check constraint:

- Story type: `storyId` non-null; `albumId` null; no `shared_link_asset`; `allowUpload = false`; `showExif = false`.
- Album type: current album rules.
- Individual type: current asset rules.

Creation captures start coordinates only as link defaults. A viewer URL may additionally contain `page=<uuid>&t=<milliseconds>`; these values are navigation hints, not authorization tokens and are never interpolated into SQL. `page` identifies a content page; omitting it starts at the distinct cover scene. Resolve it against the linked published revision. Invalid, removed, negative, overflow, or inaccessible positions fall back to the cover scene and return the canonical resolved position. Offset is clamped to the page duration; for a click-to-play video it does not force playback.

## Canonical JSON document

The persisted root is:

```json
{
  "cover": { "elements": [], "id": "00000000-0000-4000-8000-000000000000", "readingOrder": [] },
  "pages": [],
  "schemaVersion": 1,
  "theme": { "id": "classic", "version": 1 },
  "unplacedAssetIds": []
}
```

### Invariants

- JSON is accepted only through semantic commands, never a general replacement or JSON Patch endpoint.
- Unknown keys are rejected at command input and absent after canonicalization. Object keys are serialized lexicographically for hashing.
- IDs are client-generated UUIDv4 values, stable, and unique across the cover, all pages, and all elements in a story. An insert with an existing ID is invalid unless replaying an identical mutation.
- `cover` is a required distinct scene at the document root, not the first content page. It has a stable ID, background, elements, and reading order. It is always the initial scene unless a valid shared-link content-page start is supplied. The cover does not participate in page reordering or page-count limits.
- Pages are an array in canonical presentation order. Array order is authoritative and no redundant `position` is persisted. There are 1–500 content pages.
- Each page has `id`, a versioned template token, background token/color, duration defaulting to 6,000 ms and bounded to 1,000–60,000 ms, transition preset, elements, and explicit `readingOrder` element IDs.
- Elements are ordered bottom-to-top by their array order. No redundant `position` is persisted. There are at most 100 elements per scene and 5,000 total, including the cover.
- Frames use finite logical page units: 800×1000 for portrait 4:5, 1600×900 for landscape 16:9, and 1000×1000 for square. Every persisted geometry value, including coordinates, dimensions, rotation, radii, borders, and offsets, is quantized to 0.001 logical unit. Width and height are positive and the ordinary page bounds are `x ∈ [0, pageWidth]`, `y ∈ [0, pageHeight]`; rotation is canonicalized to `[-180,180)`. Geometry may extend outside the page only where a command explicitly supports bleed, by at most 25% of the corresponding page dimension. The viewer clips to scene bounds.
- Asset IDs in elements or the unplaced tray occur in `story_asset`. Every media element has exactly one referenced asset. Built-in stickers use catalog IDs and never asset IDs.
- Image crop rectangles and focal points are normalized and bounded. Video has no crop, opacity, filter, shadow, or mask and preserves intrinsic aspect ratio; server canonicalization adjusts the requested frame rather than accepting distortion.
- Text is plain Unicode, maximum 20,000 UTF-8 bytes per element and 200,000 per story. Font, theme, sticker, template, transition, and animation tokens must exist in immutable server catalogs.
- Page and element animation timing must fit the page clock. At most 8 concurrently animated elements are allowed. Reduced-motion behavior is mandatory.
- `readingOrder` contains every non-decorative element exactly once. Decorative elements have `ariaHidden: true`; meaningful images require alt text or an explicit empty-alt acknowledgement. Layer order and reading order are independent.
- Groups are not in V1. Anchored captions identify a target image element and one of nine anchor tokens. Deleting the target converts the caption to a free text element at its canonical frame.
- Missing or trashed assets remain valid references and render placeholders. They cannot be newly inserted or newly published. Restoring the asset restores rendering.

## Semantic command contract

All commands are discriminated by `op` and versioned independently of document schema. V1 covers:

| Family         | Operations                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Story          | `story.setMetadata`, `story.setTheme`                                                                                                                        |
| Cover          | `cover.setBackground`, `cover.setTemplate`                                                                                                                   |
| Pages          | `page.insert`, `page.duplicate`, `page.remove`, `page.move`, `page.setTemplate`, `page.setBackground`, `page.setTiming`                                      |
| Media          | `element.addImage`, `element.addVideo`, `element.replaceAsset`, `element.setImageCrop`, `element.setVideoPlayback`                                           |
| Text/decor     | `element.addText`, `element.addSticker`, `element.addShape`, `element.setText`, `element.setTextStyle`                                                       |
| Common element | `element.patchGeometry`, `element.setBorder`, `element.setAnimation`, `element.setAccessibility`, `element.moveLayer`, `element.remove`, `element.duplicate` |
| Reading order  | `page.setReadingOrder`                                                                                                                                       |
| Tray           | `tray.addAssets`, `tray.removeAssets`, `tray.placeAsset`                                                                                                     |
| Batch layouts  | `layout.applyTemplate`, `layout.createAutomaticDraft`                                                                                                        |
| History        | `history.undoBatch`, `history.redoBatch`, `history.restoreRevision`                                                                                          |

Each batch contains `baseRevision`, `clientMutationId`, `sessionId`, `clientSequence`, optional `source`, and 1–100 commands. Maximum decoded request size is 1 MiB. Commands are applied to an isolated in-memory document, checked after each command and as a final whole, canonicalized, then persisted with the revision and indexes in one database transaction under a row lock on `story`.

`layout.createAutomaticDraft` is deterministic server logic with a versioned algorithm token and explicit asset IDs; it never silently searches the library. Imports are translated into ordinary tray/layout commands so history and undo work uniformly.

Validation errors are `422` with `{code, commandIndex, path, message, allowedValues?}`. Authorization failures are `403` without leaking whether an inaccessible asset exists. Missing targets are `404`. Stale heads are `409 STALE_REVISION` with current revision number/ID and whether the intervening revisions are metadata-only; the response never includes another actor's command payload.

## History, undo, publish, and recovery

- One accepted batch creates exactly one revision and one mutation row. Pointer movement is never sent; pointer-up sends one geometry command.
- Undo is not a pointer move. The client submits `history.undoBatch` naming an authored revision. The server derives and validates inverse commands against the current head. If later changes make inversion unsafe, return `409 UNDO_CONFLICT`; the UI can restore the earlier full revision as a new head instead.
- Redo is the inverse of the resulting undo revision and follows the same rule.
- Restore accepts a historical revision ID and creates a new head containing a migrated copy of that document, with source `restore`. It does not alter the published pointer.
- Publish is owner-only. It locks the story, validates every referenced asset against the owner's access and current story membership, validates the required cover scene, creates no content revision, sets `publishedRevisionId = draftRevisionId`, rebuilds `story_published_asset`, and invalidates rendition caches. Re-publishing the same head is idempotent.
- Unpublish is owner-only. It clears the pointer and published index; all story links then return `404 STORY_NOT_PUBLISHED` while remaining administratively visible.
- A stale client reloads the head and may replay unacknowledged semantic batches. V1 performs no server-side rebase. If replay fails, the UI offers discard or **Save as copy**, which creates a new private story from the client's last valid canonical snapshot after validating assets.
- Multi-tab clients use broadcast-channel leader coordination as a UX optimization, but correctness relies only on base revision and mutation idempotency. A second tab may edit and will receive ordinary stale conflicts.

## Collaboration permissions

The model mirrors albums while making publish/share boundaries explicit:

| Action                     | Owner | Editor |                                Viewer |
| -------------------------- | ----: | -----: | ------------------------------------: |
| View draft/history         |   yes |    yes | current + published history read-only |
| Apply commands/import      |   yes |    yes |                                    no |
| Name revisions             |   yes |    yes |                                    no |
| Publish/unpublish          |   yes |     no |                                    no |
| Add/remove/change members  |   yes |     no |                                    no |
| Create/update/revoke links |   yes |     no |                                    no |
| Delete/restore story       |   yes |     no |                                    no |

Adding an asset requires that the acting editor has ordinary read access at that moment. Publishing rechecks all current assets against the owner's access. If an editor later loses ordinary access, the existing draft reference becomes a missing placeholder for that editor. Only the owner may publish, and publishing fails while the owner lacks access to any non-missing referenced asset. Removing a story member immediately removes draft/history access but does not remove assets they own; ordinary asset authorization is rechecked for signed-in editing, and published rendition policy below controls viewers.

## Story-scoped rendition authorization

Renditions use `GET /stories/:storyId/revisions/:revisionId/assets/:assetId/rendition` for members and `GET /stories/shared/assets/:assetId/rendition` under shared-link authentication. The server chooses a bounded preview/poster size and safe content type; callers cannot request arbitrary filesystem paths or transformations.

| Principal/state                             | View published rendition                | Draft/historical rendition         | Original download                                             | Metadata/library APIs   |
| ------------------------------------------- | --------------------------------------- | ---------------------------------- | ------------------------------------------------------------- | ----------------------- |
| Owner/editor with ordinary asset access     | yes                                     | yes                                | ordinary asset rules                                          | ordinary asset rules    |
| Owner/editor after asset access loss        | placeholder                             | placeholder                        | no                                                            | no                      |
| Story viewer member                         | yes if referenced and asset active      | yes if referenced and asset active | no by story permission                                        | no new asset permission |
| Public/password link                        | yes, published index only               | no                                 | only via explicit story download endpoint and `allowDownload` | never                   |
| Expired/revoked link                        | no                                      | no                                 | no                                                            | no                      |
| Trashed asset                               | placeholder                             | placeholder                        | no                                                            | no                      |
| Deleted asset/owner                         | placeholder                             | placeholder                        | no                                                            | no                      |
| Partner asset after partnership/access loss | placeholder on next authorization check | placeholder                        | no                                                            | no                      |

Every request verifies story/link existence, deletion state, revision eligibility, element/reference membership, asset state, and principal. For a public link, asset membership is a single join through `story_published_asset` matching the current published revision. It returns only the derivative bytes needed by the renderer, strips metadata, uses `Content-Disposition: inline`, and disables range requests except for encoded-video streaming.

Cache keys include story ID, published revision ID, asset ID, rendition profile, and link authorization class. Private responses are not placed in a public CDN cache. Revocation and republish change the authorization keyspace; short private cache TTLs remain defense in depth. Documents and URLs never contain the shared-link bearer key beyond the existing link transport.

Original download, if enabled, is a separate audited endpoint that re-runs all checks and emits a sanitized filename. It grants only the referenced original, never sidecars, metadata exports, live-photo companions unless separately referenced, or library navigation.

## AI provider and immutable draft flow

Provider precedence is: enabled per-user override, then enabled server default, then setup-required. Admin policy may disable all AI, external AI, thumbnail transmission, or user overrides. Only built-in hosted endpoints and admin-defined endpoint records are selectable; users never submit a base URL. Endpoint validation rejects non-HTTPS by default, redirects, credentials in URLs, private/link-local/loopback destinations unless explicitly configured as an administrator-owned local endpoint, DNS rebinding, oversized responses, and unsupported ports. Calls use strict connect/total timeouts, response limits, concurrency limits, and redacted logs.

First use requires current consent for text transmission. Thumbnail consent is separate and unchecked by default. Vision input is generated as dedicated tiny derivatives (maximum 256 px longest edge), strips EXIF/profile metadata, and is limited to explicit current-story or picker-scoped asset IDs. Faces, face names, precise location, OCR, filenames, secrets, originals, and unrelated assets are excluded unless a future category-specific consent explicitly adds them.

AI never receives database access or canonical write tools:

1. Server resolves provider/consent and creates a request scope containing immutable story revision and asset IDs.
2. The adapter receives a compact outline and versioned semantic tool schemas. Asset/page inspection remains within scope and budget.
3. Model output is parsed into semantic commands with unknown fields rejected. At most two repair attempts receive machine-readable validation errors.
4. The server validates commands against an isolated copy of `baseRevision`, canonicalizes them, and stores an immutable `story_ai_draft` with commands, hash, diff, expiry (24 hours), actor, and scope. Preview renders that stored document.
5. Apply accepts only AI draft ID plus a new mutation envelope. It locks the story, verifies actor, expiry, command hash, provider-independent policy, and exact base revision, then applies the stored canonical commands transactionally. It never accepts replacement commands at apply time.
6. Any intervening revision returns `409 AI_DRAFT_STALE`; the user requests a new preview. Successful application records source `ai`, links the draft to its result revision, and is undoable as one batch.

Provider requests have per-user/admin-configurable daily token and image limits, maximum two concurrent calls per user, cancellation on client abort where supported, and audit metadata containing provider/model, story/revision, categories sent, counts, latency, and outcome—but never prompts, thumbnails, credentials, or model output by default.

## HTTP and DTO outline

All authenticated routes use new granular permissions parallel to albums (`story.read/create/update/delete/share`, `storyUser.*`, `storyAi.*`). OpenAPI/Zod schemas are the contract.

```text
POST   /stories
GET    /stories
GET    /stories/:id
PATCH  /stories/:id                         metadata only
DELETE /stories/:id
POST   /stories/:id/restore                 restore soft-deleted story

GET    /stories/:id/document                current draft + revision
POST   /stories/:id/commands                atomic mutation envelope
POST   /stories/:id/import                  album IDs, asset IDs, mode, layout
POST   /stories/:id/duplicate

GET    /stories/:id/revisions               cursor pagination
GET    /stories/:id/revisions/:revisionId
PATCH  /stories/:id/revisions/:revisionId   name only
GET    /stories/:id/revisions/:revisionId/compare?to=
POST   /stories/:id/revisions/:revisionId/restore
POST   /stories/:id/publish
DELETE /stories/:id/publish

GET    /stories/:id/users
PUT    /stories/:id/users
PATCH  /stories/:id/users/:userId
DELETE /stories/:id/users/:userId

GET    /stories/:id/revisions/:revisionId/assets/:assetId/rendition
GET    /stories/:id/revisions/:revisionId/assets/:assetId/download

POST   /stories/:id/ai/drafts
GET    /stories/:id/ai/drafts/:draftId
POST   /stories/:id/ai/drafts/:draftId/apply
DELETE /stories/:id/ai/drafts/:draftId
GET    /stories/ai/provider
PUT    /stories/ai/provider                 per-user configuration/secret replace
DELETE /stories/ai/provider
PUT    /stories/ai/consent

GET    /stories/shared                      published document + resolved start
GET    /stories/shared/assets/:assetId/rendition
GET    /stories/shared/assets/:assetId/download
```

`POST /shared-links` accepts `type: story`, `storyId`, optional `startPageId`, and `startOffsetMs`; existing shared-link update/delete/password flows remain authoritative. Story responses expose `hasUnpublishedChanges`, current/published revision IDs and numbers, role, cover rendition URL, counts, and missing-asset count, but not raw collaborator asset metadata.

## Migrations, jobs, and operational limits

Ship in additive migrations:

1. Add enums and story, story-user, revision, asset-index, mutation, AI, and consent tables with indexes and constraints.
2. Extend shared links with Story target and check constraints; existing rows remain unchanged.
3. Add access-repository queries and permissions; regenerate schema/OpenAPI SQL artifacts.

No data backfill is needed. Rollback must first reject Story shared links and then remove only new rows/types; do not rewrite existing album links.

Jobs:

- `StoryDocumentMigrate`: idempotently materializes a newer schema revision when required; old revisions remain immutable and are migrated in memory when viewed.
- `StoryReferenceAudit`: reconciles current/published asset indexes and reports corruption; it never silently edits revision JSON.
- `StoryAiDraftCleanup`: deletes expired unapplied AI drafts and tiny temporary thumbnails.
- `StoryRenditionWarmup`: optional after publish for cover and first pages; failure does not fail publish.
- `StoryStorageReport`: calculates revision storage by owner and raises admin/user warnings.

Initial defaults: 500 pages, 5,000 elements, 2,000 unique assets, 100 commands/batch, 1 MiB batch, 10 MiB canonical document, 200 revisions listed per page, and 5 GiB revision storage per owner as an emergency ceiling. The ceiling is administrator-configurable. At 80% warn; at 100% reject content-changing revisions with `STORY_HISTORY_QUOTA_EXCEEDED` while allowing view, export, naming, unpublish, and delete. Never auto-prune. AI has stricter provider request budgets independent of story storage.

## Acceptance tests

### Persistence and commands

- Create atomically produces owner, empty revision zero, and consistent draft pointer.
- Property/model tests generate valid command sequences and prove apply, canonical serialization, hash stability, inverse, replay, and deterministic summaries.
- Geometry fixtures for all three aspect ratios prove 0.001-unit quantization, canonical rounding at half steps, boundary/bleed handling, and byte-stable replay; array-reorder fixtures prove pages and layers need no persisted position fields.
- Invalid geometry, timing, catalogs, media rules, duplicate IDs, dangling reading order, unknown fields, and limit overflow fail without any row change.
- Same mutation retry returns byte-equivalent response; altered reuse conflicts; concurrent same-base writes yield exactly one success.
- Crash/fault injection at each transaction boundary leaves revision, head pointer, mutation, and asset indexes mutually consistent.

### History and publishing

- Every accepted batch is visitable by ID and timestamp; naming does not change hash/content/revision.
- Restore creates a new greater revision and preserves both old and published pointers.
- Draft edits do not alter shared output. Publish changes output atomically and unpublish disables it.
- Editors can edit and preview but receive `403` from publish and unpublish; the owner can perform both. Every publish validates the distinct root cover and starts ordinary links there.
- Missing/trashed assets produce placeholders; restore revives them; publishing rejects newly inaccessible references.
- Quota behavior warns, rejects safely, and never deletes history.

### Authorization and sharing

- Exhaustive role tests cover every matrix action, member removal, deleted users, and soft-deleted stories.
- Public link tests cover key/slug, password cookie, expiry, revocation, start page/time, malformed inputs, republish, and unpublish.
- A shared-link principal can fetch only assets in the exact published revision, cannot fetch draft-only or neighboring assets, cannot call ordinary asset/metadata/face/location APIs, and cannot alter rendition parameters into SSRF/path traversal.
- Asset access loss, partnership removal, trash, delete, and owner deletion stop bytes on the next authorization check and cannot be defeated by cache reuse.
- Download is impossible unless enabled and never includes sidecars/metadata or an unreferenced live-photo companion.

### AI and credentials

- Provider precedence and every admin-disable combination are deterministic.
- Credential round trips decrypt only inside the provider adapter; API/log/error/backup fixtures contain no plaintext secret. Key rotation and wrong/missing master-key behavior are tested.
- Consent is invalidated by disclosure hash change; text-only requests send no thumbnail; vision sends only explicit tiny stripped renditions.
- Endpoint tests cover redirects, DNS rebinding, loopback/private networks, timeout, oversized response, cancellation, and redaction.
- AI apply uses exactly the stored command hash, rejects expiry/stale revision/wrong actor/tampering, creates one revision, and is undoable in one action.

### Performance and observability

- Current document read, command apply, publish, and first shared rendition meet agreed budgets at maximum V1 document size on representative PostgreSQL hardware.
- Authorization uses bounded indexed queries with query-count assertions; it never performs one query per element.
- Metrics cover command latency/conflicts/validation codes, document and history size, publish failures, rendition denials/cache behavior, AI latency/cost categories, and cleanup backlog without high-cardinality story or user labels.
