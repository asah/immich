# Photobooks: interactive, designed stories from Immich photos

Status: proposal
Scope: responsive web editor and viewer; no native mobile or print support in the first release

## Summary

Photobooks should be a resource separate from albums. Albums answer “which assets belong together?” while photobooks answer “how should this story be presented?” A photobook is an ordered sequence of fixed-aspect-ratio pages containing photos, text, stickers, and optional animation. It can import assets from one or more albums without retaining a live dependency on those albums.

The first release should favor a constrained, predictable design system over an unrestricted graphics editor. Users can start from an automatic layout, edit it directly, and ask an AI assistant to make changes. Direct editing and AI editing must invoke the same typed, versioned command API so every operation is validated, undoable, and testable.

## Goals

- Let users deliberately order photos and pages.
- Support attractive layouts with photos, text, stickers, borders, and simple animation.
- Make creation approachable on desktop, tablet, folding phones, and mobile web.
- Import all or selected photos from one or more albums in one action.
- Let an AI assistant propose and apply correct edits without giving an LLM direct database or arbitrary API access.
- Preserve Immich's ownership, privacy, and asset authorization guarantees.
- Keep documents durable as the editor and AI providers evolve.

## Non-goals for the first release

- Native iOS or Android editing.
- Print production, bleed, CMYK, physical page sizes, or print-vendor integration.
- Frame-by-frame animation, audio tracks, or a general-purpose video editor.
- Arbitrary HTML, CSS, scripts, custom fonts, or external image URLs in a document.
- Simultaneous multiplayer editing.
- AI generation or modification of the user's actual photos.

## Product model

### Photobooks and albums

A photobook is owned independently of albums and has its own title, cover, sharing lifecycle, and permissions. Its media references Immich assets directly. “Import from album” takes a snapshot of the album's current asset IDs, filters out inaccessible items, deduplicates them, and adds them in the album's visible order. Later album additions, removals, sorting changes, or deletion do not silently rewrite the book.

The import dialog should offer:

- one or more albums;
- all assets or a selection;
- append, insert after the current page, or replace an empty book;
- one photo per page, an automatic layout, or add to an unplaced-media tray.

Provenance such as `sourceAlbumId` may be recorded for attribution and a future “import new items” action, but it is not a live relation. The server must recheck access to every asset during import.

### Pages, elements, and coordinates

Each book selects a canvas aspect ratio from a small initial set (portrait 4:5, landscape 16:9, and square). All pages in a book use that ratio. Element geometry is stored in page-normalized units (`x`, `y`, `width`, and `height` from 0 to 1), with rotation in degrees and an integer z-index. This makes rendering independent of screen pixels and prevents a desktop layout from changing on a narrow device.

The document contains ordered pages. Each page has a background and ordered elements of these types:

- `asset`: an Immich photo or video poster, with crop, focal point, fit mode, opacity, corner radius, border, and optional shadow;
- `text`: plain text with a semantic style, typography, alignment, color, background treatment, opacity, and accessibility metadata;
- `sticker`: a built-in, versioned graphic or an uploaded Immich image asset;
- `shape`: a small safe set of rectangles, ellipses, and lines for backgrounds and decoration.

Elements may be locked, hidden, grouped, or designated as the page background. Z-order is explicit. User-provided stickers should be normal Immich assets, not blobs embedded in the document. Built-in stickers need stable IDs and versioned bundled files so an old book continues to render.

### Ordering

Page order is the canonical presentation order. A filmstrip supports drag-and-drop and keyboard reordering, with “move before/after” actions as an accessible alternative. Within a page, layers use explicit z-order and expose bring forward, send backward, bring to front, and send to back actions. Fractional ordering keys can reduce renumbering during ordinary edits, but the service should periodically normalize them.

An unplaced-media tray is important: importing 200 photos must not immediately manufacture 200 pages, and removing a photo from a page should not imply removing it from the book's working set.

## Editing experience

### Start flow

Creation offers four paths:

1. blank book;
2. import album(s);
3. choose photos from the Immich picker;
4. describe a book to the AI assistant.

An automatic first draft should use deterministic local rules even when no AI provider is configured: capture-time ordering, orientation-aware templates, face/focal-point-safe crops when metadata is available, and a conservative page density. AI is an enhancement, not a prerequisite for photobooks.

### Direct manipulation

Selecting an element shows handles for resize and rotation on pointer-capable screens. Dragging uses alignment guides, snapping, safe margins, and minimum target sizes. Holding a modifier can disable snapping on desktop. Numeric controls in the inspector provide precise position, size, rotation, opacity, and layer order and are the primary fallback on touch and for accessibility.

Crop editing should manipulate a crop window and focal point rather than altering the source asset. The editor must warn about very low effective resolution, even though print quality is not initially supported.

Undo and redo are required from the beginning. A command-based history is preferable to snapshots for normal edits, with periodic document snapshots for recovery.

### Text

Text can be added in a free-standing box or attached to an image as a caption/overlay. The user places it by:

- choosing a quick position (top/bottom/center and left/center/right), which creates an anchored element with sensible margins; or
- switching to free placement and dragging/resizing it on the canvas.

Anchors are easier to use on small screens and survive image crop changes; free placement offers control. Converting between them should be explicit.

The initial font catalog should be a small, server-bundled, redistributable set, represented by stable font-family tokens rather than arbitrary font names. Offer semantic presets such as title, subtitle, caption, label, and body, then controlled overrides for size, weight, line height, letter spacing, alignment, and color. Treatments should include none, solid/transparent background, gradient scrim, outline, and shadow. Contrast checks should warn when overlay text is hard to read; an “auto contrast” option can choose light/dark text and a scrim based on the underlying crop.

Plain text only should be stored in version one. Rich text greatly complicates selection, responsive editing, AI commands, accessibility, and migration, and can be added later as structured spans.

### Stickers, images, borders, and transparency

Stickers and image overlays use the same geometry, rotation, opacity, grouping, snapping, and z-order controls as other elements. Rotation should snap to 0°, 45°, 90°, and neighboring element angles, while still allowing a numeric degree value.

A border is structured data: width in normalized page units, style (`solid`, `dashed`, or `double` initially), color, opacity, join, and whether it is drawn inside the element bounds. Limiting styles makes rendering consistent across browsers. Shadows likewise use bounded presets plus color and opacity. Transparency applies to the whole element; per-pixel alpha comes from supported PNG/WebP/SVG built-ins. User-supplied SVG should not be accepted initially because it is an active-content and sanitization risk.

### Animation

Animation should be optional, page-oriented, and preset-based. The user chooses a page duration and transitions between pages, and may assign an entrance, emphasis, or exit preset to an element. Each animation has:

- preset ID (fade, rise, slide, scale, gentle pan/zoom);
- start time and duration in milliseconds;
- easing token;
- optional direction and intensity;
- reduced-motion behavior (`omit`, `fade`, or `instant`).

A compact timeline appears on desktop/tablet. On phones it becomes a list such as “Title: fade in at 0.5 s” with tap-to-edit fields. Scrubbing and playback preview use the same renderer as the viewer. Durations and concurrent effects should be bounded to avoid unreadable or costly designs. Viewer playback pauses when the tab is hidden and honors `prefers-reduced-motion`; users can also disable motion per book view.

Video assets initially render with a poster and a user-selected behavior: poster only, tap to play, or autoplay muted while its page is active. Explicitly designing this prevents accidental bandwidth and audio surprises.

## Responsive web design

The document has one canonical layout; the editor chrome adapts around it.

### Wide screens (at least 1024 CSS px)

- Left: page filmstrip and unplaced-media tray.
- Center: fit-to-space canvas with pan/zoom.
- Right: properties/layers panel.
- AI assistant in a collapsible side panel.

### Tablets and unfolded foldables

- Canvas occupies the main pane.
- Filmstrip is a collapsible rail or bottom strip.
- Inspector and AI use a resizable side sheet.
- Pen input is treated as precise pointer input; touch targets remain at least 44 CSS px.

### Phones and folded foldables

- One major surface at a time: Pages, Canvas, Layers/Properties, or AI.
- A bottom toolbar opens full-height or half-height sheets for editing.
- Selection is tap-first. Dragging is available, but position/size presets and numeric steppers avoid requiring fine motor control.
- Pinch zoom and two-finger canvas pan must not conflict with one-finger element movement; a “pan” mode provides an unambiguous fallback.
- Page reordering uses a full-screen list with drag handles and move actions.

Use container queries for editor panes, not only viewport breakpoints, because split-screen tablets and foldable hinges can produce unusual effective widths. Respect safe-area insets and avoid placing critical handles across a reported display hinge. Persist editor panel state per device locally, not in the book document.

The viewer should letterbox the canonical page rather than reflow authored elements. Text must remain selectable/accessible through a synchronized semantic overlay or accessible DOM representation; the canvas cannot be the only representation.

## Persistence and API design

### Suggested data model

Use normalized top-level records for authorization, listing, and references, with versioned JSON for the evolving design document:

```text
photobook
  id, ownerId, title, description, coverAssetId?, aspectRatio
  documentVersion, revision, createdAt, updatedAt, deletedAt?

photobook_document
  photobookId, revision, schemaVersion, documentJson, createdAt, actorId

photobook_asset
  photobookId, assetId, role, sourceAlbumId?, createdAt

photobook_user (future collaboration/sharing)
  photobookId, userId, role
```

`photobook_asset` makes authorization, deletion impact, search, and garbage/reference checks possible without querying arbitrary JSON. The JSON document contains references to those rows, never an unchecked asset UUID. A current snapshot plus a bounded revision history is sufficient initially; retain snapshots at meaningful milestones and compact command history according to a documented policy.

Every write includes `baseRevision`. The server applies a validated command batch transactionally and returns the new revision plus canonicalized operations. A stale revision returns a conflict with enough metadata to reload or, later, rebase. This provides autosave safety now and a path to collaboration later.

Asset deletion is a core product decision. Recommended behavior: show references in the asset deletion warning, then render a durable “missing asset” placeholder if deletion proceeds. Books must never preserve a secret second copy of a deleted original. Trashing and restoring an asset should restore the reference while the asset remains recoverable.

### Command API

The UI and AI share a narrow operation vocabulary. Example commands include:

```json
{
  "baseRevision": 17,
  "clientMutationId": "uuid",
  "commands": [
    { "afterPageId": "uuid", "op": "page.insert", "pageId": "uuid", "template": "full-bleed" },
    { "assetId": "uuid", "elementId": "uuid", "frame": { "height": 1, "width": 1, "x": 0, "y": 0 }, "op": "element.addAsset", "pageId": "uuid" },
    { "anchor": "bottom-left", "elementId": "uuid", "op": "element.addText", "pageId": "uuid", "style": "title", "text": "Summer 2026" },
    { "elementId": "uuid", "op": "element.patch", "patch": { "opacity": 0.9, "rotation": -3 } }
  ]
}
```

Commands use stable IDs, enums, bounded numbers, and discriminated schemas. Avoid a generic JSON Patch endpoint: it exposes implementation details, is hard to authorize semantically, and gives an LLM too many ways to create invalid state. Commands should be idempotent through `clientMutationId`; batches are atomic; validation errors include the command index, machine-readable code, and actionable allowed values.

The server enforces ownership/role, referenced-asset access, element/page limits, payload size, font/sticker allowlists, animation bounds, valid geometry, and current revision. It must never trust the browser or AI gateway to have validated a command.

Useful endpoint groups are:

- CRUD, list, duplicate, and soft-delete photobooks;
- retrieve the current document and revision;
- apply command batch;
- import album/assets;
- retrieve lightweight AI context and available command schemas;
- share/view (a later phase).

OpenAPI should remain the public contract. The command schema has its own `schemaVersion`; migrations transform old documents on read or in a background job, while the renderer supports at least the previous version during rollout.

## AI-assisted design

### Provider setup and key storage

On the first AI action, not on first photobook use, prompt the user to configure a provider. The first provider may be OpenAI-compatible, but the persisted model should already be provider-neutral: provider type, base URL where applicable, model, capability flags, and credential reference.

The requested GPT key must not be stored in ordinary user-preference JSON or returned by the preferences API. Add a dedicated per-user AI provider/credential store. Encrypt credentials at rest with a server-held master key, never log them, never return them after creation, display only a fingerprint such as the final four characters, and provide replace/test/delete operations. If the server has no credential-encryption key configured, do not persist provider keys; offer session-only browser storage with a prominent warning, or disable AI setup. The deployment documentation must include backup/key-rotation and unrecoverable-key behavior.

Provider metadata and defaults can appear in user settings; the secret remains server-side. Route model calls through Immich so the browser never repeatedly receives the key, CORS is predictable, and quotas, cancellation, and audit metadata can be enforced. Self-hosters should be able to disable external AI globally. Later providers implement a common adapter rather than changing the photobook API.

### Context and tool use

Do not ask the model to memorize the REST API or emit raw HTTP. Give it versioned tool definitions generated from the same schemas used by the server. The model receives:

- a compact document outline (page IDs, element IDs/types, styles, timings, and selected-page details);
- a searchable asset catalog containing only assets the user explicitly put in scope, with IDs, dimensions, dates, and selected metadata;
- low-resolution thumbnails only when the user consents to sending images and the chosen model supports vision;
- commands such as `searchScopedAssets`, `inspectPages`, `applyDraftCommands`, and `renderPreview`.

Large books require progressive disclosure. Send summaries first, then let the model request specific pages or thumbnail contact sheets. Never place originals, API secrets, hidden asset metadata, face names, location, or unrelated library contents in context by default.

The model produces a draft command batch. A deterministic gateway parses it, rejects unknown fields, validates it against the current revision and user permissions, and returns either a preview diff or precise repair errors. The model may get a small bounded number of repair attempts. It cannot call arbitrary Immich endpoints, access the database, choose its own URLs, or bypass the command service.

### User control and safety

AI edits should be staged and summarized: “Moved 8 photos across 4 pages; added 2 captions; changed the theme.” Highlight affected pages and offer Apply, Refine, or Discard. Small, explicitly requested low-risk edits may support an opt-in auto-apply mode later, but deletion of pages/assets, replacement of user text, bulk changes, and sharing always require confirmation.

Applied AI batches are a single undo step and record provider/model plus command hashes, not prompts or private content by default. Users can opt into local prompt history. Network requests need clear disclosure, cancellation, timeouts, token/cost estimates where available, per-user rate limits, and understandable provider error messages.

Prompt injection can arrive through captions, filenames, OCR, or model-visible images. All asset content is untrusted data. Tool authority is fixed by the gateway, and the model must not gain additional permissions from content in the book.

## Rendering architecture

Use one scene model and rendering semantics for edit and view. A DOM/SVG-based renderer is preferable initially because text layout, focus, accessibility, hit testing, and responsive browser behavior are easier than with a canvas-only implementation. Rasterize only where performance measurements justify it. CSS transforms and the Web Animations API can implement the constrained effects; keep renderer output deterministic and testable.

The editor maintains an optimistic local command queue and autosaves after a short debounce. IndexedDB can keep unsent command batches and the last document snapshot for crash/offline recovery, but server state remains authoritative. Display Saving, Saved, Offline, and Conflict states explicitly. Uploads must finish and receive an asset ID before a document can reference them.

Virtualize page thumbnails and only mount the active page plus nearby pages. Request thumbnail-sized derivatives, not originals. Preload the next viewer page, cap decoded-image memory, cancel stale requests, and test on low-memory phones. Performance budgets should include interaction latency, initial editor load, memory for a 200-page book, and smooth playback under reduced CPU.

## Sharing, collaboration, and permissions

The first release can be owner-only editing and private viewing, but the schema should not foreclose sharing. When sharing arrives, keep roles simple: viewer and editor. An editor may arrange only assets they are authorized to view; opening a shared book must not become a route to fetch an otherwise unauthorized original. Shared-link behavior needs explicit choices for download, metadata visibility, comments, expiration, and password protection.

Simultaneous collaboration should wait until revision conflicts and audit history are proven. A later implementation can rebase independent commands or adopt a CRDT for ordering/geometry, but introducing a CRDT before the operation vocabulary stabilizes would add considerable complexity.

Duplicating a shared book must copy the design only for assets the recipient may access and replace the rest with placeholders. Ownership transfer, user deletion, partner sharing changes, and external-library removal require the same reference policy as asset deletion.

## Accessibility, localization, and privacy

- All commands need keyboard equivalents; focus order, visible focus, announcements, and undo must work without pointer input.
- Provide alt text per meaningful image element, allow decorative elements to be marked decorative, and expose page reading order separately from z-order.
- Warn about insufficient contrast and tiny text; do not encode meaning only through color or animation.
- Respect zoom, high contrast/forced colors where feasible, reduced motion, and screen readers.
- Use grapheme-safe text handling, bidirectional text, locale-aware fonts, and mirrored alignment controls for RTL locales. Avoid storing rendered line breaks as canonical content.
- Photobook analytics and AI telemetry should be opt-in/consistent with Immich policy and must not contain photo content or prompts by default.
- The AI consent screen must say which provider receives which thumbnails/metadata and that the provider's retention terms apply.

## Limits and abuse resistance

Set configurable limits for pages, elements per page, total referenced assets, text length, command batch size, history retention, sticker upload type/size, animation count, and AI request frequency. Validate decoded image dimensions to prevent decompression bombs. Sanitize text at render boundaries, use a strict content security policy, and never allow document JSON to introduce URLs or executable markup.

Define graceful behavior for unsupported/legacy elements, missing fonts, corrupt documents, unavailable derivatives, and partially failed album imports. A book should remain openable and exportable as JSON for support even when some content cannot render.

## Phased delivery

### Phase 1: durable manual editor

- Separate photobook resource, navigation, list, create/delete/duplicate.
- Album and asset import, unplaced-media tray, page ordering.
- Constrained page templates, photos, plain text, built-in stickers/shapes.
- Crop, anchor/free positioning, rotation, z-order, opacity, borders, undo/redo, autosave.
- Responsive editor and accessible static viewer.
- Revisioned command API and document migrations.

### Phase 2: motion and recovery

- Page/element animation presets and video behavior.
- Timeline/list editor, playback, reduced-motion variants.
- Offline command queue, recovery UI, bounded revision history.
- Private share/view flow if authorization work is complete.

### Phase 3: AI assistant

- Provider-neutral settings and encrypted BYOK credentials.
- Scoped context service, generated tools, draft validation/repair loop.
- Preview/apply/discard, one-step undo, privacy controls, budgets and rate limits.
- OpenAI-compatible adapter first; additional hosted or local adapters later.

Shipping AI after the command API and editor are mature is deliberate: it lets the assistant use a stable, already-tested operation surface instead of becoming a second editor implementation.

### Later possibilities

- Shared editing with revision rebasing and presence.
- Themes and community template packs with a signed/sandboxed format.
- Audio narration and richer video timelines.
- Import-new-items from source albums.
- Export to a self-contained web presentation or rendered video.
- Printing, after introducing physical units, bleed/safe zones, font embedding, color management, and server-side high-resolution rendering.

## Testing strategy

- Property and fuzz tests for document/command validation, migration, bounded geometry, and malformed AI output.
- Service tests for authorization, asset deletion/restoration, stale revisions, idempotency, atomic batches, album import, and sharing boundaries.
- Golden/screenshot tests for each template, font, border, crop, RTL layout, reduced-motion state, and representative browser.
- End-to-end keyboard, touch, pen, resize, rotation, undo, offline recovery, and AI preview flows.
- Responsive matrices that include narrow phone portrait/landscape, split-screen tablet, large tablet, unfolded/folded viewport changes, browser zoom, and safe-area/hinge simulation.
- Performance tests with large images and at least 200 pages on throttled CPU/network and constrained memory.
- Security tests for prompt injection, unauthorized asset IDs, SVG/URL injection, secret redaction, oversized documents, and malicious provider responses.

## Decisions recommended now

1. Keep photobooks separate from albums and make album import snapshot-based.
2. Use a fixed-aspect normalized page coordinate system and adapt editor chrome, not authored layout, across devices.
3. Start with constrained styles and animation presets rather than arbitrary CSS or a free-form timeline.
4. Make the typed command service the only mutation path for both humans and AI.
5. Store provider secrets in a dedicated encrypted credential store, never ordinary user settings.
6. Require preview/confirmation for AI batches and treat each applied batch as one undoable operation.
7. Build the manual editor and stable command surface before enabling AI.

## Open questions

- Is the first viewer private-only, shared to Immich users, or available through public shared links?
- Should a photobook allow assets owned by collaborators, or only assets owned by the book owner in the first release?
- Which aspect ratios, bundled fonts, themes, and sticker set should ship initially, and who maintains their licenses?
- Should all videos be supported, or should version one treat videos as poster-only?
- How many document revisions should be retained, and should named restore points be user-visible?
- Is a server-wide AI provider/key desirable in addition to per-user BYOK, and which setting wins?
- Should thumbnails and captions ever be sent to an external model by default, or should every new book require explicit scope consent?
- What is the intended public name: Photobooks, Stories, Scrapbooks, or a broader “Creations” family that could later contain all three?
