# Stories Phase 0: editor and renderer specification

Status: implementation-gating specification

Parent: [Stories proposal](../stories.md)

Review: [Stories expert review](../reviews/stories-expert-review.md)

## Purpose and decisions

This document fixes the rendering and authoring semantics required before production implementation. It covers the shared scene renderer, direct manipulation, accessible authoring, responsive behavior, performance, and conformance testing. Server persistence and product flow are specified separately.

The first implementation must use a DOM/SVG renderer, not Fabric.js or a bitmap canvas. Immich already depends on Fabric, but its canvas object model would make selectable text, browser text shaping, focus, screen-reader access, and deterministic edit/view parity harder. HTML elements provide text and media; one SVG overlay provides selection outlines, handles, guides, and safe-margin decoration. Editor chrome and the object list remain ordinary semantic DOM. The viewer mounts the same scene component without authoring overlays.

The renderer may reuse Immich's adaptive image and authenticated media URL services, HLS pipeline, reduced-motion preference, shortcut infrastructure, and established pointer-event techniques. Existing asset-viewer zoom/swipe components must not be embedded wholesale: they own global zoom state and gestures that conflict with element manipulation.

## Canonical scene space

### Coordinate system

Each page has an immutable aspect-ratio token and integer logical dimensions:

| Token            | Logical width | Logical height |
| ---------------- | ------------: | -------------: |
| `portrait-4:5`   |           800 |           1000 |
| `landscape-16:9` |          1600 |            900 |
| `square-1:1`     |          1000 |           1000 |

All persisted geometry uses logical page units, not normalized floats or CSS pixels. This supersedes the normalized-unit proposal. Integer page units make rounding, bounds, minimum sizes, border thickness, and conformance fixtures unambiguous while remaining resolution-independent. Commands may accept decimals to three places; the server canonicalizes every scalar to one thousandth of a logical unit using round-half-away-from-zero. JSON numbers must be finite.

The page origin is its top-left corner. Positive x points right and positive y points down. An element frame is its unrotated border box `{x, y, width, height}`. The transform origin is always the frame center. The canonical transform order is:

```text
page translation(x, y)
→ translation(width / 2, height / 2)
→ rotation(clockwise degrees)
→ translation(-width / 2, -height / 2)
→ element-local rendering
```

Rotation is canonicalized to `[-180, 180)`. Frames must have positive dimensions. Elements may extend beyond the page during an active gesture, but committed visible bounds must intersect the page by at least a 24-by-24 logical-unit square. Pages clip all element content and shadows at their rectangular bounds.

Viewer scale is a single uniform CSS scale `s = min(containerWidth/pageWidth, containerHeight/pageHeight)`. The page is centered and letterboxed; it never reflows. CSS placement values are derived from logical units before applying one page-level scale. Device-pixel snapping is forbidden because it changes geometry across scale factors. Visual regression tolerance is one CSS pixel at the tested viewport; geometry API tolerance is 0.001 logical unit.

### Ordering and identity

Page and element IDs are immutable UUIDs. A story has one distinct root `cover` scene plus an ordered `pages` array. The cover is not page zero, never participates in content-page reordering, and is addressed through its stable cover-scene ID. It uses the same aspect ratio, logical coordinate system, element model, renderer, reading-order rules, and accessibility contract as content pages. It supplies the opening scene and share-preview composition; changing or replacing it does not change page IDs or page order.

Arrays are authoritative for content-page order and layer order; array index zero is backmost. Persist no `z-index` or fractional ordering key. Reorder commands name `beforeId` or `afterId`, and the server returns the canonical array. A scene background is scene data, never a special element.

Each page also persists `readingOrder`, an array of all non-decorative element IDs. Layer order never implies reading order. Decorative elements have `accessibility.role = "presentation"` and do not appear in `readingOrder`. Adding a meaningful element appends it to reading order; deletion removes it; duplication inserts the copy immediately after the source.

### Bounds, groups, and anchors

Version one has no nested groups. Multi-selection is ephemeral editor state and a batch of element patches on commit. This avoids a second coordinate system and ambiguous group rotation.

Anchored text refers to a target image ID plus horizontal (`start`, `center`, `end`) and vertical (`start`, `center`, `end`) anchors, inset values, and an authored size. Its frame is deterministically recomputed inside the target's unrotated frame, then inherits the target rotation for placement. Changing the target frame or crop moves the text; deleting the target converts the text to free placement at its last resolved frame. RTL affects text alignment, not geometric `start`/`end`: these are physical page-start/page-end in version one and are shown as Left/Right in the UI.

### Media fit and crop

Images have `fit: cover | contain`. Their frame is the clipping rectangle. `cover` stores a normalized source-space focal point `{x,y}` in `[0,1]`; no free crop rectangle is stored in version one. Rendering uses CSS `object-fit` and `object-position` from that focal point. `contain` centers the whole source and may show the element background. Rotation metadata is already resolved by the Immich derivative pipeline before story layout.

An image border is drawn inside its frame and participates in clipping. Border width is in logical page units and is limited to `0..min(width,height)/4`; styles are `solid`, `dashed`, or `double`. Dash geometry follows browser SVG semantics and is not promised pixel-identical across engines; v1 conformance checks its bounds and color, not exact dash phase. Corner radius is a logical-unit radius clamped to half the shorter frame dimension. Element opacity multiplies media, border, and shadow together.

Videos always use their intrinsic display aspect ratio. A resize command changes one dimension and derives the other; changing both is rejected unless their ratio differs by at most 0.1%. Videos use `object-fit: contain`, cannot crop, stretch, change opacity, receive masks, filters, or shadows, and may have the same inside border as images. Missing dimensions block placement and show a non-committable error. Rotation remains supported.

### Text and fonts

Text is plain Unicode. Stored newlines are honored. Unicode normalization is not changed. Text boxes have authored width and either fixed height or `height: auto`; automatic height is resolved by the renderer and canonicalized by the server only when a command requests conversion to fixed height.

Fonts are bundled, same-origin WOFF2 files with immutable tokens such as `font.inter.v4.latin`. A token resolves to an exact family, file checksums, supported weights/styles, fallback stack, and license. Stories never store a CSS family name. The initial catalog should include a sans, serif, display, and monospace family whose selected subsets cover Immich's supported scripts; Google Fonts is a source, not a runtime service. Unsupported glyphs use the token's bundled fallback chain. The editor waits on `document.fonts.load()` before declaring a page ready or measuring text and shows fallback text only as an explicit loading state.

Persist font size and line height in logical units, letter spacing in logical units, weight as an available numeric token, alignment, color as eight-digit sRGB hex, and direction as `auto | ltr | rtl`. Line height is an absolute logical-unit value. Rendering uses `white-space: pre-wrap`, `overflow-wrap: break-word`, `word-break: normal`, and browser-native shaping. Hyphenation is off. Overflow in fixed-height boxes is clipped and produces an editor warning; it never silently shrinks text.

Exact glyph rasterization is not a cross-browser invariant. Chromium, Firefox, and WebKit must agree on line count, overflow state, and element bounds for conformance fixtures; screenshot tolerance uses perceptual diff thresholds. Export, if added later, must use a pinned renderer and fonts.

### Color and effects

Colors are eight-digit non-premultiplied sRGB hex (`#RRGGBBAA`). Opacity is `0..1`. Compositing is normal source-over only. V1 shadows are immutable theme presets resolved to x/y offset, blur, spread, and color in logical units. No blend modes, filters, or arbitrary CSS are accepted. Built-in SVG stickers are sanitized, versioned, and rendered as same-origin resources; user SVG is unsupported.

## Time, animation, and video

Every scene, including the cover, has a duration in milliseconds, default 6000 and bounded to 1000..60000. The scene clock starts at zero only after the scene is mounted and its required fonts and poster images are ready. Navigation resets it. Pausing freezes the clock. A hidden document pauses; resuming continues from the frozen time. A deep link may seek to a clamped scene-local timestamp.

Transitions occur between pages and are part of the destination page: the destination page clock starts at zero while it transitions over the previous frozen page. Transition duration is included in page duration and bounded to `0..min(2000, pageDuration/2)`. Manual navigation still runs the transition unless reduced motion applies.

V1 animation is restricted to named presets implemented only with transform and opacity. An element animation has start, duration, easing token, preset token, and reduced-motion behavior. Start plus duration may not exceed page duration. At most eight elements may animate concurrently. The renderer derives state solely from page time; Web Animations may drive live playback, but seeking must cancel and reconstruct effects from the same pure timing function.

With `prefers-reduced-motion: reduce` or the viewer's Disable motion control, transitions become a 100 ms cross-fade and element animations follow their stored `omit`, `fade`, or `instant` behavior. Gentle pan/zoom is omitted. No animation may be essential to understanding the page.

Video modes are `click`, `autoplay`, and `delay`, with delay `0..pageDuration-1`. Autoplay/delayed video is muted. A failed autoplay changes the effective mode to click and exposes a labeled play button. Video playback begins at media time zero in v1. Pausing the story, leaving the page, hiding the document, or seeking the page clock pauses video. Seeking the story does not seek video; it resets video to zero and starts it only if the effective trigger has passed. Ended video remains on its final frame and does not advance the page. Only the active page may instantiate video decoders; neighboring pages show posters. Existing Immich HLS/native playback services should be adapted behind a story media interface.

## Renderer boundaries

The renderer is a pure projection of `(canonical document, pageId, pageTime, motionPolicy, viewport)` plus authenticated media resolvers. It emits no commands and owns no persistence. Its components should be structured as:

```text
StoryPageViewport (fit, letterbox, zoom)
└─ StoryPageScene (logical page and clipping)
   ├─ StoryElementHost[] (frame, transform, animation)
   │  └─ image | video | text | sticker | shape
   └─ semantic reading representation
StoryAuthoringOverlay (editor only; SVG)
StoryObjectList (editor only; semantic controls)
```

The semantic viewer representation follows `readingOrder`. Meaningful images use author text or a generated description explicitly accepted by the author; otherwise an empty alt marks them decorative only when the author chooses that status. Captions associated with images use `aria-describedby`. Text remains real selectable DOM text. The scene itself is not a focus trap.

Do not serialize DOM or CSS as the document model. Theme/template resolution happens before rendering and produces canonical values plus immutable theme references. Unknown element kinds or unavailable font/sticker tokens render durable labeled placeholders without crashing the page.

## Editor transaction model

The editor has four state layers:

1. acknowledged canonical document at server revision R;
2. ordered optimistic committed batches not yet acknowledged;
3. one ephemeral interaction transaction;
4. UI-only state such as selection, zoom, open panels, and scroll.

A gesture snapshots all affected canonical values on pointer-down. Pointer moves update only ephemeral overrides at animation-frame cadence. Pointer-up quantizes values and emits one semantic command batch. Escape, pointer cancellation, lost capture, route change, or invalid geometry discards the transaction. No network command is sent during movement.

Text entry is a transaction scoped to one text element. It commits on explicit Done, focus leaving the text editor, or 750 ms idle; IME composition is never split. A continued edit within the same focused session may coalesce locally for undo until another command is committed, capped at ten seconds.

Each local batch carries `clientSessionId`, monotonic `clientSequence`, `clientMutationId`, and `baseRevision`. Server acknowledgement replaces the optimistic result with the returned canonical operations before replaying later batches. Undo submits the stored inverse of the latest acknowledged/local batch as a new validated batch. Redo submits the original intent against the new head and may fail visibly. Selection changes and viewport operations are not undoable.

Only one tab may actively edit a story. A `BroadcastChannel` announces a renewable tab lease; another tab opens read-only and can explicitly Take over. Loss of lease during a gesture cancels it. IndexedDB stores the last acknowledged snapshot and unsent batches, never AI keys. Recovery replays unsent batches only when their base revision matches; otherwise it offers Download recovery data, Save as copy, or Discard. It never guesses a rebase in v1.

## Input and gesture state machine

Modes are `select`, `pan`, `text`, and `crop-focal-point`. The current mode, active pointers, and pointer capture define behavior; user-agent/device-name checks do not.

| State                     | Event                                                  | Result                                                                                   |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Idle/select               | primary down on element                                | select it, capture pointer, enter pending move                                           |
| Pending move              | movement past 4 CSS px (mouse/pen) or 8 CSS px (touch) | enter move transaction                                                                   |
| Pending move              | up before threshold                                    | select only; no command                                                                  |
| Move/resize/rotate        | move                                                   | update ephemeral geometry, guides, and announcement throttle                             |
| Any one-pointer transform | second touch arrives                                   | cancel element transform to its snapshot; enter viewport pinch using both current points |
| Viewport pinch            | pointer move                                           | update UI-only zoom and pan around pinch centroid                                        |
| Viewport pinch            | fewer than two pointers                                | return to idle; never resume the cancelled transform                                     |
| Any captured state        | up                                                     | commit exactly one batch where applicable, release capture                               |
| Any captured state        | cancel/lost capture/Escape                             | restore snapshot, release capture, announce cancellation                                 |
| Any state                 | viewport/container resize                              | preserve logical gesture inputs; if coordinate mapping becomes invalid, cancel safely    |

The canvas has `touch-action: none` only while an editor gesture surface is active. One-finger touch moves a selected element in select mode and pans only in explicit pan mode or from empty canvas after a 300 ms hold. Two fingers always pan/zoom. Wheel pans; Ctrl/Meta+wheel zooms around the cursor. Trackpad behavior follows those events. Browser page pinch remains available outside the canvas and accessibility zoom must not be blocked globally.

Pen acts as a precise primary pointer. Barrel button temporarily pans. Eraser has no destructive meaning and is ignored. Rotation has an outer mouse/pen handle, a large contextual slider, numeric input, and preset buttons for touch/keyboard. Snapping applies at page edges, centers, safe margins, and neighbor edges; Alt disables snapping for mouse/keyboard, while a visible toggle serves touch users. Rotation snaps within 3 degrees to 0, 45, 90, and neighbor angles.

Crop mode for images moves only the normalized focal point. It exposes a visible source preview and Reset. Videos never enter crop mode. Text mode uses a positioned textarea/contenteditable facade but persists plain text; pointer shortcuts do not fire during text or IME entry.

Keyboard commands apply only when the canvas/object list owns focus and not from editable controls: arrows nudge one logical unit, Shift+arrows ten units, Delete requests deletion, Escape cancels/exits, Enter opens the primary editor, and standard platform undo/redo invokes command history. Every shortcut has a visible menu equivalent.

## Responsive and occlusion behavior

Layout selection is based on editor container size, `pointer`/`hover`, and user choice, not viewport width alone:

- **Three-pane:** at least 1100 CSS px usable width; filmstrip, canvas, inspector.
- **Two-pane:** 720–1099 CSS px; canvas plus one switchable/resizable rail.
- **Single-surface:** below 720 CSS px or when either pane segment is below 480 CSS px; Pages, Canvas, Objects/Properties, and AI are mutually exclusive routes/sheets.

Container queries choose these modes. Foldable viewport segments, when exposed, are progressive enhancement: a hinge gap is treated as unavailable space, and the canvas never spans it. Without the API the resize observer and container rules still produce a usable single/two-pane layout. Safe-area environment insets pad all fixed controls.

Use `100dvh` for the editor shell with an `svh` fallback. `visualViewport` changes reposition the active text field and property sheet above the virtual keyboard without altering page geometry or canvas zoom. When necessary, scroll the selected control into view; never translate the authored scene to follow the keyboard. Orientation changes preserve selection and fit mode, cancel active gestures, and recalculate chrome.

Touch targets are at least 44 by 44 CSS px with 8 CSS px separation. At 200% and 400% browser zoom, the app may move to single-surface mode; controls must not overlap or require two-dimensional page scrolling. The viewer provides Fit and readable Zoom modes because letterboxed text can become too small on phones.

## Accessible authoring contract

The object list is a complete alternative authoring surface, not a mirror for inspection. It is a tree/list ordered by layer with each item exposing name, type, hidden/locked state, and selection. It uses conventional buttons and menus, not ARIA application mode. Selecting in either representation synchronizes the other without stealing focus.

From the object list a keyboard or screen-reader user can:

- add every supported element and choose media;
- select, rename, hide, lock, duplicate, and delete;
- move forward/back/front/back and edit reading order independently;
- edit text, alt text, captions, focal point presets, border, animation, and video mode;
- set position and size with labeled number inputs plus alignment/size presets;
- rotate with number and preset controls;
- reorder pages and restore focus predictably;
- preview, undo/redo, publish, and recover conflicts.

A polite live region announces committed changes, undo/redo, save state, page changes, and conflicts. High-frequency drag announcements are throttled to one per second and give logical position; commit is announced immediately. Deleting an item focuses the next item, otherwise the previous item, otherwise Add element. Undo focuses the restored item. Changing page focuses the page heading unless initiated from the filmstrip, where focus remains on the active page control.

Pages have an editable narrative reading-order list. Viewer keyboard order follows it, not layer order. Decorative items are skipped. Automated contrast warnings are advisory; overlay presets must include a deterministic scrim option. The default theme must meet WCAG 2.2 AA for chrome and known solid text/background combinations. Motion, focus visibility, labels, error association, and target sizes are release gates.

## Performance budgets

Budgets are measured on a throttled reference profile: Chromium mobile emulation, 4x CPU slowdown, 4 GB device memory, 20 Mbps/80 ms network, current supported viewport; and on current Firefox/WebKit without throttle for conformance.

| Measure                                                                          |                                                          Budget |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------: |
| Editor route interactive, warm authenticated session, 200-page metadata document |                                                     p75 ≤ 2.5 s |
| Active page ready with cached derivatives/fonts                                  |                                                    p75 ≤ 500 ms |
| Pointer/handle visual response                                                   |                                 p95 ≤ 50 ms interaction latency |
| Gesture frames                                                                   |           ≥ 55 fps p95 session; no task > 100 ms during gesture |
| Page navigation to poster-ready                                                  |                                                    p75 ≤ 700 ms |
| Viewer playback frame rate with 8 animated elements                              |                                            ≥ 55 fps p95 session |
| JS heap after settling on a 200-page story                                       |                                                        ≤ 180 MB |
| Decoded image budget                                                             |                                                         ≤ 96 MB |
| Active DOM                                                                       | active page + at most one neighbor each side; ≤ 500 story nodes |

Only the active page and immediate neighbors mount. Neighbors use posters and do not mount video decoders or animations. Filmstrip and object/media trays are windowed with overscan of two viewports. Page metadata stays available, but derivative requests are demand-driven. Use `ResizeObserver` for pane sizing, `IntersectionObserver` for trays, and abort stale fetches. Request the smallest derivative at least as large as rendered CSS size times device pixel ratio, capped at a 2048-pixel long edge in the editor. The viewer may request larger existing derivatives when zoomed. Preload only the next likely page and release prior image references after navigation.

If a page exceeds 100 elements, the editor warns and refuses further additions; animations remain capped separately. Performance telemetry must contain timings and counts, never titles, captions, asset IDs, or image data.

## Test and conformance plan

### Pure model tests

- Property-based tests for quantization, transforms and inverse transforms, rotated intersection, aspect-locked video resize, focal positioning, anchor resolution, order operations, and bounds.
- Golden JSON fixtures for every schema element/theme token and unknown-token placeholders.
- Timing tests at boundary instants for transitions, seek, pause/resume, hidden tabs, reduced motion, delayed/autoplay fallback, and deep links.
- Command/gesture tests proving zero commands during movement, exactly one on commit, exact cancellation, inverse validity, canonical acknowledgement replay, and text/IME coalescing.

### Component and accessibility tests

- Vitest and Testing Library tests for renderer projection, semantic reading order, focus restoration, live-region messages, keyboard operations, locked/hidden behavior, and video controls.
- Axe checks on every editor mode and viewer state; manual NVDA/Firefox, VoiceOver/Safari, and TalkBack/Chrome passes.
- A no-pointer scripted acceptance test builds, edits, previews, and publishes a story at 100%, 200%, and 400% zoom.

### Browser and visual conformance

A checked-in fixture story exercises every aspect ratio, font/script, element type, rotation, crop focal point, border, overflow, anchor, transition, and missing resource. Playwright runs it in current Chromium, Firefox, and WebKit at phone, tablet split-screen, tablet, and desktop sizes with DPR 1 and 2. Assertions cover:

- page and element bounding boxes within one CSS pixel;
- identical line count, overflow status, reading order, and accessible names;
- perceptual screenshot diff with separately approved engine baselines;
- seeked animation frames at fixed timestamps;
- blocked autoplay fallback and only one active decoder;
- virtual keyboard/visual viewport simulation where supported;
- pointer capture loss, second-finger cancellation, pen-pointer events, resize, orientation, and reduced motion.

Do not require identical antialiasing or dashed-border phase. Any intentional baseline change requires a schema/theme/rendering change note.

### Recovery and endurance

- Model-based sequences cover ack, retry, duplicate response, disconnect, refresh, tab takeover, stale revision, undo, redo, and Save as copy; invariants are no lost acknowledged command, no duplicate application, and a recoverable representation of every unsent batch.
- A 30-minute edit soak and 30-minute viewer loop check heap growth, abandoned HLS sessions, stale requests, timers, and event listeners.
- Performance CI records the budgets above on the reference story. A repeatable 10% regression blocks release; noisy single runs trigger reruns rather than failure.

## Implementation gates

Production work can begin after these artifacts are approved:

1. version-one JSON schema reflecting this geometry and ordering contract;
2. pure TypeScript reference functions for transforms, crop/focal placement, anchors, ordering, and page timing with golden fixtures;
3. a non-production DOM/SVG renderer spike proving all three aspect ratios, bundled font readiness, media clipping, selection overlay, fixed-time animation seek, and semantic reading order;
4. a gesture harness demonstrating pointer cancellation and second-finger transition on touch, mouse, and pen events;
5. an object-list prototype in which a story can be authored without the canvas;
6. cross-browser fixture results and measured memory/frame budgets on a 200-page synthetic story.

The production schema must use the reconciled logical-unit geometry and authoritative array ordering defined by this specification and the server contract. It must not reintroduce normalized frame geometry, integer z-indexes, or fractional ordering keys.
