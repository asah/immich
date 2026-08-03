# Stories expert review

Date: 2026-08-03

Design reviewed: [Stories: interactive, designed narratives from Immich photos](../stories.md)

## Review panel

The proposal was independently reviewed from three perspectives:

- a consumer photo-product PM focused on albums, memories, sharing, onboarding, and retention;
- a principal web engineer focused on design editors, touch and pen interaction, accessibility, rendering, and document architecture;
- a staff AI/platform security engineer focused on BYOK, LLM tools, privacy, authorization, and self-hosting.

This document synthesizes their findings. It records areas of consensus as well as material disagreements between product, engineering, and security perspectives.

## Subsequent product decisions

After this review, the product direction resolved several questions:

- The public feature name is **Stories**.
- Stories will reuse Immich's existing sharing system, including public links, and its album collaboration model.
- Shared viewing will use story-scoped renditions rather than requiring ordinary library access.
- Version one will use a small hardcoded FOSS visual catalog with bundled, licensed fonts and assets.
- Version one will support constrained embedded video playback.
- All committed versions will remain visitable by timestamp, with optional names.
- A server-wide AI provider is the default and per-user BYOK may override it.
- First-use AI consent includes a separate choice for sending very-low-resolution thumbnails.
- Shared links may deep-link to the current page and playback timestamp.

The findings below are retained as the review record; where they posed one of these questions, the subsequent decision above controls.

## Overall assessment

The proposal is a strong architectural foundation, but it is not ready for Phase 1 implementation. It describes an editor and its safety boundaries more clearly than the end-to-end consumer experience. A product and technical definition phase should precede implementation.

The central product job is not merely arranging objects on a canvas. It is helping a person turn an overwhelming set of photos into a coherent, emotionally satisfying story with little effort, then letting its intended audience enjoy it.

## Strong consensus

All three reviewers supported:

- keeping stories separate from albums while making “Create from album” seamless;
- snapshot-based album imports;
- a constrained editor instead of a general-purpose design tool;
- one typed semantic command API for both human and AI editing;
- atomic command batches, revision checks, previews, undo, and server-side validation;
- deterministic non-AI creation as a first-class capability;
- AI as an optional enhancement, with server-side encrypted credentials and tightly scoped context;
- fixed authored layouts with responsive editor chrome;
- deferring simultaneous collaboration until revision and conflict behavior is proven.

The unplaced-media tray, explicit missing-asset handling, staged AI edits, provider-neutral adapters, responsive modes, and early attention to accessibility were also viewed as strong choices.

## Priority findings

### P0: Make the MVP outcome-first, not editor-first

The proposed first phase emphasizes geometry, layers, rotation, borders, stickers, and free placement. The primary consumer loop is more likely:

```text
too many photos → coherent story → something worth sharing → revisit or reaction
```

The recommended initial experience is:

1. Import an album or selected photos.
2. Curate the selection.
3. Receive a good automatic draft.
4. Choose a theme and approximate length.
5. Reorder pages and swap, add, or remove photos.
6. Edit titles, captions, and narrative text.
7. Choose a cover.
8. Preview as a recipient.
9. Publish and share.
10. Return later to edit or remix it.

Free positioning, arbitrary shapes, detailed borders, uploaded stickers, advanced animation, and exact geometry should follow later.

### P0: Decide what the product is

The former product name implied print, spreads, and physical pages. Animation and video suggest a digital story. “Story” can imply temporary vertical content, while “scrapbook” implies manual decoration.

Before locking public terminology, decide whether the primary promise is:

- a durable digital memory artifact;
- an animated photo story;
- a decorative memory collage; or
- an umbrella called “Creations” containing several formats.

A plausible direction identified by the review was “Creations” as the product family and “Photo Story” as the first format. The subsequent product decision instead selected **Stories** as the public feature name. Internal primitives can remain generic scenes or pages without exposing ambiguous terminology to users.

### P0: Treat curation as a core feature

The proposal handles arrangement better than selection. Choosing 30 strong photos from 400 similar photos is often the hardest consumer problem.

Add a curation stage with:

- Include, Maybe, and Exclude states;
- duplicate and burst grouping;
- favorites and must-include photos;
- date or event grouping;
- used versus unplaced status;
- suggestions for poor-quality images and outliers;
- quick comparison between similar photos;
- optional balance across people, dates, and locations.

The deterministic automatic draft should produce a concise selection, not merely lay out every imported image. A short creation brief can ask for the intended audience or occasion, desired length, chronological versus thematic organization, style, and must-include photos. “Surprise me” should remain available.

### P0: Bring viewing, publishing, and sharing into Phase 1

A creation cannot be designed properly until its consumption model is known. Define:

- swipe, scroll, page-turn, or autoplay navigation;
- cover and opening behavior;
- progress and page navigation;
- pause, replay, and reduced-motion behavior;
- letterboxing and viewer zoom on narrow phones;
- portrait and landscape media handling;
- share-preview imagery and metadata;
- link visibility, expiration, revocation, and download controls;
- whether reactions or comments are eventually expected.

Use explicit Draft and Published revisions. Autosaved changes remain in the draft until the author publishes again, so experimentation and AI changes do not immediately alter a shared presentation. Include “unpublished changes,” preview-as-viewer, publish, and restoration of a prior published version.

### P0: Define deterministic document geometry

Normalized coordinates alone do not guarantee stable rendering. Before implementation, define:

- a logical design coordinate system for each aspect ratio;
- the reference dimension for borders, offsets, and corner radii;
- rotation origins and transform order;
- cropping, clipping, shadows, lines, and group transforms;
- anchor behavior when image crops or bounds change;
- font tokens and font versions;
- font loading, shaping, fallback, line height, wrapping, and rounding behavior;
- acceptable cross-browser rendering tolerances;
- independent page, layer, narrative-reading, and accessibility orders.

The proposal currently mentions both integer z-indexes and fractional ordering keys. Select one authoritative ordering scheme. Define group coordinate systems, background semantics, anchored-text targets, animation references, and reading-order defaults in a schema invariant table and command coverage matrix.

### P0: Specify undo, autosave, conflicts, and recovery

The interaction and persistence model needs an explicit contract:

- Pointer movement is ephemeral during a gesture.
- Pointer-up creates one committed command rather than hundreds of commands.
- Undo applies a validated inverse operation instead of silently rewinding server state.
- Commands carry client/session IDs and monotonic sequence numbers.
- Retried commands remain idempotent.
- Multi-tab editing uses a leader or lease, or exposes a clear lossless conflict flow.
- “Offline” initially means recoverable unsent changes, not necessarily full offline editing.
- An unrebasable conflict offers recover, discard, or save as copy.
- Server canonicalization is folded into local history deterministically.

Model-based tests should verify command application, inversion, replay, retries, crashes, stale revisions, server canonicalization, and two-tab behavior. Recovery invariants should guarantee no duplicate commands, no lost acknowledged commands, deterministic replay, and a recoverable copy when rebase is impossible.

### P0: Design accessible authoring, not only an accessible viewer

A synchronized semantic viewer overlay does not make the editor accessible. The visual canvas should be one representation of a fully operable object and layer list.

That control surface needs:

- selection synchronization;
- keyboard reordering and nudging;
- resize and rotation controls;
- text-edit mode;
- screen-reader announcements;
- focus restoration after deletion, undo, and page changes;
- explicit reading order;
- viewer zoom or authored minimum text sizes.

Numeric fields alone are not an adequate phone or accessibility fallback. Accessibility testing should cover building an entire story without pointer interaction, including screen-reader focus and announcements at 200% and 400% browser zoom.

### P0: Define story-scoped media authorization

The proposal says a shared story must not expose otherwise unauthorized originals, but it does not define what a story share grants. Checking only ordinary asset access would make many shared stories incomplete. Checking only story access could expose originals, metadata, faces, locations, or neighboring assets.

Define a story-scoped rendition capability:

- A viewer can fetch only the rendition necessary to view an asset referenced by that story.
- Story access does not grant ordinary asset API access.
- Originals, EXIF, face data, locations, and library navigation remain inaccessible.
- Original download is a separate owner-controlled permission.
- Every request verifies current story access, the element reference, story and asset state, owner state, and link expiry or revocation.
- Durable bearer grants do not appear in document JSON or media URLs.
- Cache keys include authorization context and cannot convert private derivatives into public objects.
- Losing partner-sharing access stops the referenced rendition from resolving by default.

Create an authorization matrix covering owners, editors, signed-in viewers, public-link viewers, asset owners, partner-shared assets, trashed assets, revoked links, expired links, and deleted users.

## Product and interaction corrections

### Make themes central

Fonts, colors, borders, stickers, and animations are ingredients; consumers need coherent results. A versioned theme should define:

- font tokens;
- palette and backgrounds;
- spacing;
- caption treatment;
- compatible page templates;
- optional page transitions;
- decoration constraints.

The default editing mode should favor theme and template changes. Free-form overrides belong under Customize or Advanced. AI should remain within the selected theme unless explicitly asked to restyle the creation.

Templates and themes need immutable versions or resolved values, plus explicit detach and upgrade semantics, so older creations do not change unexpectedly.

### Separate text concepts in the UI

Expose three understandable authoring concepts even if they share an internal element model:

- a photo caption associated with a particular image;
- a story text block or narrative page;
- a decorative overlay with contrast and accessibility treatment.

Each needs different defaults and behavior. Decorative overlays should use a bounded scrim for dependable readability; an advisory contrast calculation alone cannot guarantee readable text over textured imagery.

### Define the cover workflow

The cover is essential to the creations library, share preview, and opening moment. Decide whether it is:

- the normal first page;
- a separately authored cover scene; or
- a generated thumbnail based on a designated page.

Include title, hero image, and share-thumbnail behavior in the MVP.

### Use progressive disclosure

The controls described in the proposal can overwhelm casual users. Use:

- a default mode for themes, templates, reordering, photo swapping, cropping, and captions;
- a Customize mode for movement, resizing, overlays, and stickers;
- an Advanced inspector for exact geometry and animation timing.

On phones, template slots, presets, and the object list should be primary. Free placement is an advanced capability.

### Specify gesture behavior

Use interaction modes based on available pane dimensions, pointer precision, hover capability, and user preference rather than device labels alone. Define a gesture state machine covering:

- pointer capture and lost capture;
- `touch-action` behavior;
- pan, selection, text, and crop modes;
- pinch gestures while an element is selected;
- a second finger arriving during a drag;
- pen barrel and eraser behavior;
- cancellation and viewport resize during a gesture;
- virtual-keyboard and browser-chrome occlusion.

Foldable segmented-viewport APIs should be progressive enhancement rather than a required layout mechanism. Rotation handles are weak on touch; provide a large contextual rotation control and preset sheet.

### Defer rich motion and video

Animation needs a deterministic page clock defining page duration, transition overlap, entry and exit timing, seeking, looping, visibility, and reduced-motion behavior. Constrain effects to transform and opacity and cap simultaneous composited layers.

Poster-only video is the safer first-release behavior. Autoplay and interactive video introduce decode memory, seeking, battery, network, audio, and page-clock complexity. Initially consider only theme-selected page transitions and optional gentle pan/zoom effects. Validate whether users value element-level timelines before building them.

## AI and platform corrections

### Do not permit arbitrary provider URLs by default

A user-configured OpenAI-compatible base URL called by the Immich server creates an authenticated SSRF and credential-exfiltration surface. It could target localhost, Docker services, NAS administration, cloud metadata services, Redis, PostgreSQL, or an attacker-controlled endpoint.

Initial support should use:

- known hosted provider endpoints;
- administrator-configured local endpoints;
- an administrator allowlist or approval process for custom endpoints;
- HTTPS by default, with explicit administrative approval for local HTTP endpoints;
- redirect, DNS-rebinding, private-address, response-size, and timeout protections;
- egress isolation where practical.

Never forward arbitrary user headers. The UI must clearly state that credentials are disclosed to the configured endpoint.

### Do not store provider keys in browser storage

If server credential encryption is unavailable, disable external BYOK persistence. If a transient mode is retained, keep the key in memory only and clear it on navigation or logout. Never use localStorage, sessionStorage, or IndexedDB for provider credentials.

Server-side storage needs authenticated encryption, credential-specific nonces or data keys, authenticated binding to the user and provider IDs, key versioning, rotation, multi-instance distribution, backup and restore behavior, startup validation, and deletion on user removal. Redact credentials from logs, traces, provider error bodies, support exports, and reverse proxies.

The security promise should remain accurate: at-rest encryption protects the database and backups, not a compromised running Immich server.

### Bind AI preview and apply

An AI preview must represent the exact commands later applied:

1. The model edits an isolated draft workspace.
2. The server stores an immutable draft containing canonical commands, base revision, actor, asset scope, expiry, provider/model, and content hash.
3. Preview renders that stored draft.
4. Apply accepts only the draft ID or short-lived token, not newly supplied commands.
5. The server verifies the hash, user, story, permissions, asset access, scope, and current revision in one transaction.
6. Any intervening edit invalidates the preview and requires re-previewing.

The initial model tool set must not include canonical apply, sharing, deletion, access changes, credential changes, or external actions.

### Prefer semantic AI tools

Do not ask a model to calculate low-level geometry when deterministic layout code can do so more reliably. Offer operations such as:

- create a title page from these assets;
- shorten the story to 20 photos;
- group pages by day;
- apply the minimal theme;
- improve caption readability;
- keep these five photos and redesign the rest.

The server can translate semantic intent into lower-level validated commands. Generate AI-facing schemas from authoritative command definitions, but expose a smaller curated subset. Let the server allocate IDs or support batch-local symbolic references rather than requiring model-generated UUIDs.

### Make AI consent category-specific

Before external transmission, disclose:

- provider and actual endpoint;
- whether prompts, captions, filenames, OCR, dates, or thumbnails are sent;
- approximate number of assets or pages;
- provider retention, training, and data-residency caveats.

Recommended defaults:

- Do not send photos, OCR, face data, precise locations, or filenames.
- Generate dedicated low-resolution thumbnails with EXIF removed.
- Use an immutable, explicit asset-ID scope for each request.
- Never let tool search expand into the user's general library.
- Do not let a shared editor transmit another person's photo without an explicit policy.
- Allow an administrator to prohibit visual egress while permitting text-only or local inference.

AI-generated factual captions and alt text should remain visibly identified until accepted because models can invent people, places, dates, and relationships.

### Add hard cost and reliability bounds

Enforce server-side limits for:

- prompt bytes and output tokens;
- thumbnails and tool calls;
- repair attempts and total change magnitude;
- wall-clock time and concurrent jobs;
- per-user and server-wide request or token budgets;
- retries and circuit breakers;
- provider response size, decompression, JSON depth, streaming frames, and redirects.

Cancellation may not prevent provider billing and should be described accurately. Preserve a draft when a provider fails. Record sanitized usage, latency, outcome, and estimated cost without storing prompts or media content by default.

### Expand prompt-injection defenses

Fixed tool authority prevents privilege escalation but not damaging authorized edits. Add:

- strict separation of instructions from asset-derived content;
- truncation and sanitization of filenames, captions, OCR, and metadata;
- no secrets in system prompts or tool results;
- an externally enforced action/change budget;
- deterministic summaries generated from commands rather than model prose;
- warnings for links or credential requests in model output;
- adversarial tests involving visual text, OCR, QR codes, filenames, captions, bidi overrides, and translations.

Confirmation, trustworthy diffs, and undo are the primary defenses, not prompting alone.

## Recommended delivery sequence

### Phase 0: product and technical validation

Prototype and test:

- naming and primary product promise;
- import and curation;
- creation brief and automatic draft;
- theme selection;
- cover, canonical viewer, publishing, and sharing;
- deterministic geometry and multilingual text rendering;
- gesture behavior across mouse, touch, and pen;
- complete keyboard and screen-reader authoring through an object list;
- undo, autosave, offline recovery, and two-tab conflicts;
- representative worst-page performance on low-memory phones and tablets.

The product test is whether users can create something they are proud to share without learning a graphics editor.

### Phase 1: lightweight story

- Separate creation resource and library.
- Album and photo import.
- Curation with duplicate grouping and used/unplaced states.
- Automatic draft guided by a short creation brief.
- Template-slot editing, page reordering, photo swapping, and cropping.
- Titles, captions, and narrative text pages.
- A small set of coherent, versioned themes.
- Cover workflow.
- Draft and published lifecycle.
- Responsive viewer and safe sharing.
- Typed command API, autosave, undo, migrations, and story-scoped renditions.

### Phase 2: creator tools

- Free placement and layers.
- Stickers and decorative overlays.
- Rotation, opacity, and borders.
- Advanced text treatments.
- More templates and themes.
- Named versions and improved recovery.
- Basic theme-controlled transitions.

### Phase 3: AI assistance

- Encrypted BYOK and provider endpoint policies.
- Task-oriented actions and suggestion chips.
- Scoped text and vision consent.
- Immutable preview drafts.
- Deterministic diffs and one-step undo.
- Usage, concurrency, cost, and request limits.

A narrow AI feature can ship once its narrow command vocabulary is stable; AI does not need to wait for every advanced manual editor feature.

### Phase 4: richer media and collaboration

- Element animation and timeline.
- Richer video behavior or narration.
- Comments and reactions.
- Collaborative editing.
- Static/self-contained export, remixing, and template ecosystems.

## Testing additions

- Renderer conformance scenes covering multilingual text, RTL, emoji, delayed or failed font loading, crop, borders, groups, device pixel ratio, browser zoom, and Safari.
- Model-based command tests covering inverse/redo, snapshot replay, duplicate mutation IDs, stale bases, canonicalization, crashes, and multiple tabs.
- Pointer tests covering cancellation, lost capture, second-finger insertion, rotation across ±180°, viewport resize mid-drag, and virtual-keyboard opening.
- Accessibility tests covering creation of a complete story without pointer input and screen-reader focus and announcements.
- Performance gates based on worst-page complexity as well as total page count: decoded memory, compositor layers, DOM nodes, interaction latency, background/foreground transitions, and teardown.
- Security tests for unauthorized asset IDs, story-rendition escalation, expired/revoked links, SSRF, DNS rebinding, redirect handling, malicious provider responses, visual prompt injection, secret redaction, and support-export leakage.
- Recovery invariants proving no duplicate commands, no loss of acknowledged commands, deterministic replay, and a recoverable copy after irreconcilable conflicts.

## Material disagreements and tradeoffs

### Sharing in the MVP

The original proposal deferred sharing. The product review considers a safe viewer and sharing path part of the core emotional loop, not optional infrastructure. The synthesis agrees that sharing should be in Phase 1.

### AI sequencing

The original proposal placed AI after the mature manual editor. The product review argues that a narrow AI capability can ship once its narrow command vocabulary is stable, while advanced manual controls continue later. The synthesis agrees: AI should follow a stable command boundary, not necessarily every professional editing feature.

### Authored composition versus mobile readability

Fixed aspect ratios preserve authored intent but can produce small text when a landscape page is letterboxed on a portrait phone. Viewer zoom, minimum text guidance, theme defaults, and real-device testing are required.

### DOM/SVG accessibility versus performance

DOM/SVG supports text, focus, and semantics better than a canvas-only renderer, but filters, masks, video, and many transformed nodes can perform poorly on constrained devices. Keep scene state renderer-independent, isolate pages, use CSS containment, lower-quality previews during gestures, and constrain page complexity rather than prematurely moving everything to canvas.

### Story-scoped renditions versus ordinary asset access

Story-scoped media makes sharing useful but creates a new authorization and caching surface. Requiring ordinary asset access is simpler but breaks expected sharing behavior. The review favors story-scoped renditions with strict capabilities.

### Provider flexibility versus SSRF safety

Arbitrary compatible endpoints suit self-hosters but require administrative controls and strong egress isolation. Curated or administrator-defined endpoints are the safer initial design.

### Static output versus animation

Static PDF, image, or self-contained web export may align better with memory preservation and self-hosting than advanced animation. Its value should be tested before investing in element-level timelines.

## Open decisions

1. Who is the primary author: casual family organizer, enthusiast, or design-oriented creator?
2. What is the canonical viewer navigation model?
3. Are two-page spreads ever part of the format?
4. Should an automatic draft reduce the selected photo set or include everything?
5. What creation-brief questions provide enough signal without becoming onboarding friction?
6. How are AI-generated factual claims identified and accepted?
7. Is an external LLM compatible enough with Immich's privacy positioning to be a headline feature?
8. Is a static or self-contained export more valuable than animation to the initial audience?
9. Who owns the long-term maintenance and license-review process for themes, bundled fonts, and stickers after the hardcoded version-one catalog?

## Recommended decision

Proceed to a Phase 0 definition and prototyping effort rather than implementing the original Phase 1 directly. Preserve the proposal's command API, revision, privacy, and constrained-rendering foundation, but refocus the first product slice on curation, automatic storytelling, themes, publishing, viewing, and safe sharing.
