# Stories Phase 0: product and experience specification

Status: implementation contract

Parent design: [Stories](../stories.md)

Review input: [Stories expert review](../reviews/stories-expert-review.md)

## Purpose

This document resolves the Phase 0 product questions required to build the first web release of Immich Stories. It defines user-visible behavior and acceptance criteria. Storage, command, rendering, authorization, and AI implementation details may refine the mechanism, but must preserve this contract.

Stories are durable, authored narratives made from a user's Immich library. They are not temporary social posts, printable books, or a replacement for albums. The primary job is:

```text
too many photos and videos -> a coherent draft -> a personal edit -> an enjoyable shared story
```

## Product assumptions

### Primary author

The primary author is an existing Immich user who has an event, trip, year, person, or collection already represented by an album or asset selection. They value a good result quickly more than pixel-level design control. They may begin on desktop and make later edits on a phone or tablet.

The v1 editor therefore optimizes for automatic drafting, template slots, curation, text editing, reordering, and preview. Exact geometry and decorative controls are progressive enhancements, not prerequisites for completing a story.

### Primary audience

The primary audience is family or friends viewing through either their Immich account or a public shared link. Viewers may be on a narrow phone, may have reduced-motion enabled, and may not understand Immich controls. Viewing requires no editing knowledge and public viewing requires no account.

### Success criteria

A first-time author can import an ordinary event album, get a coherent draft, make a recognizable personal change, publish it, and copy a working share link without documentation. A recipient can understand navigation, pause motion or video, and finish the story on a narrow mobile viewport.

## Canonical end-to-end flow

1. The author chooses **Create story** from Stories, an album, or an asset selection.
2. The author chooses assets. Album import is a permission-checked snapshot in its visible order.
3. For more than 20 assets, the curation step opens by default. For 20 or fewer, the step is summarized and may be expanded.
4. The author completes a short creation brief or chooses **Surprise me**.
5. Immich immediately creates a private story draft and produces a deterministic local draft. AI is optional and never blocks this flow.
6. The editor opens with a cover and pages. The author may reorder pages, swap/remove media, change crops for images, edit text, select a theme, or return to curation.
7. **Preview** opens the exact current draft in the canonical viewer without publishing it.
8. **Publish** freezes the current draft revision as the published revision. The author can then reuse Immich's sharing UI.
9. Later edits autosave to the draft and do not change what recipients see until **Publish changes**.

Leaving the creation flow after step 2 never loses work. An unfinished story appears in the Stories library as a draft and resumes at the last completed step.

## Creation brief

The brief is intentionally short and is stored with the story so it can seed redrafting and future AI requests.

Required inputs have defaults:

| Field        | Choices and default                                                              |
| ------------ | -------------------------------------------------------------------------------- |
| Title        | Suggested from album title or date; editable; untitled is allowed while drafting |
| Organization | `chronological` (default) or `thematic`                                          |
| Length       | `short`, `medium` (default), `long`, or `use all included`                       |
| Theme        | A previewable bundled theme; default is `classic`                                |

Optional inputs:

- audience/occasion: free text up to 200 characters, local-only unless included in a consented AI request;
- opening or closing message;
- must-include assets, represented by the curation state rather than copied into prose.

**Surprise me** accepts the suggested title, chronological organization, medium length, and classic theme. The UI states the resulting approximate page range before generation. Initial targets are short 8–12 pages, medium 13–24 pages, and long 25–40 pages. Limits are targets rather than promises because must-include assets are never silently omitted.

## Curation

### Working set and states

Every imported asset belongs to the story working set and has exactly one author-controlled curation state:

- **Include**: eligible for the automatic draft.
- **Must include**: eligible and cannot be omitted by automatic selection; shown as a pinned variant of Include.
- **Maybe**: kept in the working set but omitted unless needed for requested length or balance.
- **Exclude**: retained in the working set but not used by automatic drafting.

New assets default to Include. State changes never remove an asset from its source album or library. Removing an element from a page returns its asset to the story's unplaced tray without changing its curation state. Removing an asset from the working set is a separate confirmed action.

Each asset also has a derived placement state: **Used** or **Unplaced**. This is not a curation choice and updates from the current draft.

### Curation interface

The curation screen is a chronological, virtualized grid with filters for All, Must include, Include, Maybe, Exclude, Used, and Unplaced. It supports multi-select state changes, a large comparison view, keyboard operation, and touch targets of at least 44 CSS pixels.

Near-duplicates and bursts are shown as collapsible groups. Expanding a group permits side-by-side comparison. Immich may recommend one representative, but does not change states until the author accepts a recommendation or generates a draft.

### Deterministic recommendations

The initial recommendation and draft algorithm is local and deterministic for the same inputs, metadata, brief, and algorithm version. It uses only metadata already available to the authorized user.

1. Preserve all Must include assets.
2. Partition assets into event groups using capture-time gaps. A gap of at least six hours begins a new group; calendar-day boundaries are retained as labels even within a group.
3. Within each burst/duplicate group, rank favorites first, then assets without quality warnings, then image quality metadata when available, then earliest visible album order as a stable tie-breaker.
4. Allocate the target asset count proportionally across event groups, guaranteeing one representative per non-empty event group where the target allows.
5. Select Include assets before Maybe assets. Exclude assets are never selected.
6. Avoid consecutive near-duplicates and, when metadata exists, avoid long runs with the same orientation or repeated subject composition. Absence of face, location, or quality metadata must not lower an asset merely because analysis is disabled.
7. Place every selected video; videos count as one selected asset. Do not choose among videos based on duration in v1.

Quality warnings (blur, very low resolution, unsupported media, or missing asset) are advisory and explainable. They never override Must include. The UI presents recommendations as proposed state/selection changes with **Accept all**, per-group acceptance, and **Undo**.

### Privacy rule

Curation is fully functional without AI. Faces are used only as anonymous local clustering signals if the author already has access to that metadata; names are not inserted into titles or captions automatically. Locations, filenames, OCR, and inferred relationships are never turned into narrative text without an explicit author action.

## Automatic draft contract

Draft generation is an atomic, undoable operation over the current working set and brief. It records the algorithm version, brief, input asset IDs and states, and theme version in the resulting history entry.

The deterministic generator must:

- create one cover followed by content pages;
- use the selected assets in chronological order unless organization is thematic;
- use only allowlisted, versioned templates compatible with the story aspect ratio and theme;
- choose layouts by media count and orientation without stretching media;
- use available focal-point data for image crops and otherwise center-crop;
- preserve video aspect ratio without cropping;
- place Must include assets before expanding with Include and Maybe assets;
- never invent captions, people, places, dates, or relationships;
- put selected but unplaced assets in the unplaced tray and report their count;
- produce the same canonical command batch for the same normalized input and algorithm version.

For v1, `thematic` groups by existing event groups and user-authored labels when present; it does not infer semantic themes. When there is insufficient information, it falls back to chronology and tells the author.

Regenerating never silently replaces manual work. From an untouched generated draft, **Regenerate** replaces the draft in one undoable batch. Once manual edits exist, the choices are **Preview regenerated version**, **Replace current draft**, or **Save as a new story**.

## Cover

The cover is a distinct, required root scene outside the ordered content-page collection; it is not content page 1 and cannot be moved into the content-page order. It is edited with a constrained cover template containing:

- title;
- optional subtitle/date;
- zero or one hero asset;
- theme background and treatment.

The automatic draft chooses the first Must include image, otherwise the highest-ranked selected image. If only videos are available, it uses the first selected video's poster. The author may choose another referenced asset or a text-only cover.

The Stories library card and link preview use a server-rendered cover rendition derived from the published cover, or from the draft for owner-only library display. Link previews never expose the underlying asset URL or private metadata. Changing the draft cover does not change an existing shared-link preview until publication.

## Canonical viewer

### Navigation model

The viewer is page-based. Exactly one page is active. The authored page is fit within the available viewport and letterboxed; authored elements never reflow. The default mode is manual navigation:

- swipe horizontally on touch;
- click/tap visible previous and next regions or buttons;
- use Left/Right Arrow, Page Up/Page Down, or Space/Shift+Space;
- choose a page from an accessible page list;
- browser Back exits the viewer rather than navigating through every viewed page.

The cover opens first unless a valid deep link selects another location. Progress is shown as `Cover`, then `1 of N` through `N of N`. Page IDs, not numeric positions, are the durable navigation identity. If a deep-linked page no longer exists in the published revision, the viewer opens the nearest surviving successor, then predecessor, and displays a brief notice; if neither exists it opens the cover.

### Playback

**Play story** starts sequential playback from the current location. Each page uses its authored duration in the inclusive range 1,000–60,000 milliseconds, defaulting to 6,000 milliseconds. The control becomes **Pause**. Manual navigation while playing continues playback from the newly selected page after restarting that page's clock. Replay on the final page returns to the cover; stories do not loop automatically in v1.

The canonical page clock starts at `0` only after the page is mounted and its required fonts plus visible poster/image renditions are ready, or after a bounded five-second load timeout. A loading failure produces a placeholder but cannot hold playback indefinitely. Transition time is included in the departing page duration. Only one transition runs at once.

When the document is hidden, the viewer pauses its clock and all video. Returning does not catch up elapsed wall time. Opening a dialog, browser media control, or accessibility page list also pauses playback. The viewer remembers no playback position after the tab is closed.

### Embedded video

A video obeys its authored mode: click-to-play, autoplay on page activation, or play after a delay measured from the page clock. Autoplay begins muted and falls back to a visible click-to-play control if blocked. Videos never make the page wait past its authored duration. Leaving or seeking away from the page pauses the video and resets it to the start in v1.

If the viewer starts at a timestamp inside a video page, the page clock begins at that timestamp but the video itself begins at source time zero; source-video seeking is explicitly outside v1. This distinction is shown in the share-link UI.

### Motion, zoom, and accessibility

`prefers-reduced-motion` defaults the viewer to manual mode, replaces movement transitions with instant changes or fades, and prevents video autoplay. The viewer offers a persistent per-session motion toggle. Play remains available but uses reduced-motion treatments.

On narrow screens the complete page remains visible initially. The viewer supports explicit zoom up to 400% and pan while zoomed. Swiping changes pages only at fit zoom or when the panned viewport has reached the relevant horizontal edge. Text is represented in accessible DOM order, remains selectable, and does not rely on pixels in a canvas. Controls have visible focus, labels, and a hide/show chrome action; hidden chrome returns on tap, pointer movement, or keyboard input.

### Viewer state URL

Authenticated and public viewer URLs may include:

```text
?page=<stable-page-id>&t=<non-negative-seconds>&play=1
```

`page` selects a page in the published revision. `t` is clamped to that page's duration and selects the page-clock offset. `play=1` requests playback, but browser autoplay and reduced-motion rules still win. The default shared URL omits all three parameters and opens the cover paused.

The viewer's **Share from here** action creates/copies a URL for the active page and current page-clock offset, rounded down to one decimal second. The share dialog previews the destination and offers **Start playing automatically**. Timestamp parameters convey presentation position only; they are not authorization secrets and may be edited safely. Authors can use the same action in draft preview, but must publish current changes before creating a recipient link to an unpublished page.

## Draft and published lifecycle

A story has one mutable head called the **draft revision** and zero or one **published revision pointer**. Every autosaved edit creates or contributes to the version history defined by the persistence specification, but recipients resolve only the published pointer.

- A new story is `Draft` and visible only to its owner and invited story collaborators.
- First publish validates the complete document, creates required renditions, and atomically points `publishedRevisionId` at the validated draft revision.
- Subsequent draft edits set the visible state to `Published · unpublished changes` without changing recipient output.
- **Publish changes** atomically advances the pointer after validation and rendition preparation.
- **Unpublish** removes recipient availability and disables its public links without deleting link configuration. Republishing re-enables unexpired, unrecalled links only after explicit confirmation.
- Restoring history creates a new draft head. It does not roll back the published pointer until the author publishes it.
- Deleting a story revokes viewing immediately and follows Immich's recoverable deletion conventions where available.

Only the owner may publish, unpublish, delete, manage collaborators, or manage public links in v1. Editors may modify the draft and preview it. Viewers may view the current draft while signed in but cannot see history or edit. A banner identifies draft preview so collaborators do not confuse it with the published recipient view.

If a published story references an asset that later becomes inaccessible, recipients see the stable missing-media treatment; the published revision is not silently rewritten. The owner sees an actionable warning before the next publication.

## Sharing and collaboration

### Reused Immich model

Stories use the album collaboration roles and interaction pattern:

| Role   | Draft view | Edit draft | Publish/manage story | Invite/remove users |
| ------ | ---------- | ---------- | -------------------- | ------------------- |
| Owner  | Yes        | Yes        | Yes                  | Yes                 |
| Editor | Yes        | Yes        | No                   | No                  |
| Viewer | Yes        | No         | No                   | No                  |

Invitations, user selection, role labels, removal behavior, and notifications should reuse album UI and service conventions. Story membership does not itself grant general library access to referenced assets; the rendition authorization specification governs what is visible within the story.

### Public links

The share dialog reuses Immich's shared-link fields and visual language: custom slug, password, description, expiration, show metadata, allow download, copy, revoke/delete, and link list. Story links add **Start at** and **Start playing automatically** controls.

V1 decisions:

- `allowUpload` is unavailable and hidden for Stories.
- `showMetadata` applies only to an explicit viewer information panel and is off by default. It never exposes face data, precise location, filenames, or EXIF not separately allowlisted by the story sharing contract.
- `allowDownload` is off by default and cannot be enabled unless the permitted download artifact is defined. In v1 it means downloading referenced originals only where the owner has authority to share them; it does not mean downloading the story as a file.
- Link expiration, password validation, slug behavior, revocation, and list management match existing shared links.
- Link preview title and image come from the published story. Description uses the link description when present, then the story description.
- Public links always resolve a published revision. Draft-only stories cannot create active public links.

A timestamped URL is a variation of an existing share, not a new shared-link database record. Revoking or expiring the base link invalidates all timestamped variants.

### Signed-in sharing

Inviting an Immich user as Viewer or Editor is collaboration, not publication. Once a story is published, a signed-in collaborator sees the published story by default and can choose **Open draft** if their role permits it. Direct links to draft preview require authentication and current membership.

## Responsive author and viewer flows

Breakpoints are driven by available container width, input capabilities, safe areas, and segmented viewports rather than user-agent device categories.

### Wide editor

At 1024 CSS pixels or wider, the default layout is page rail, canvas, and inspector, with curation and AI as dedicated panels. Preview takes over the viewport and returns to the same selection and zoom.

### Tablet and unfolded foldable

At 600–1023 CSS pixels, the canvas remains primary. Pages use a collapsible rail or bottom strip; curation and properties open as side sheets. A reported hinge divides controls and canvas rather than bisecting the canvas. Portrait/landscape rotation preserves the selected page and unsaved interaction state.

### Phone and folded foldable

Below 600 CSS pixels, one major task is shown at a time: Brief, Curate, Pages, Canvas, Properties, or Preview. The page list is the primary reordering surface. Template selection, swap, crop, caption, and presets are primary; exact placement is under Customize. Back first closes a sheet or editing mode, then returns to the Stories library after warning only if local changes have not entered the autosave queue.

The virtual keyboard must not cover the active field or publish/save status. Safe-area insets apply to viewer and editor chrome. Every flow remains usable at 200% browser zoom without horizontal page scrolling in the application chrome; viewer zoom is independent.

## Product telemetry and privacy

Telemetry, when enabled under Immich's existing policy, may record funnel steps, asset/page-count buckets, generation duration, publish outcome, viewer completion buckets, and error codes. It must not record titles, captions, asset IDs, face/location metadata, public-link tokens, passwords, AI prompts, or thumbnails.

Useful events are `story_created`, `curation_completed`, `draft_generated`, `story_previewed`, `story_published`, `story_shared`, `viewer_started`, `viewer_completed`, and `viewer_error`. Self-hosters must be able to disable telemetry through existing controls.

## Acceptance criteria

### Creation and curation

- Creating from one or more albums imports a permission-checked snapshot, deduplicates assets, and preserves visible album order as the stable tie-breaker.
- Include, Must include, Maybe, and Exclude survive reload and are independently editable from Used/Unplaced.
- Automatic generation works with AI disabled and is byte-for-byte command deterministic for a normalized fixture and algorithm version.
- Must include assets appear in the draft even when the requested target is exceeded; Exclude assets never appear.
- Regeneration after manual edits cannot overwrite them without an explicit replace choice and one-step undo.
- A 500-asset working set remains navigable through a virtualized curation UI on a representative low-memory phone.

### Cover, editing, and lifecycle

- Every publishable story has a valid distinct cover and at least one content page.
- Owner library cards use the draft cover; recipient cards and previews use the published cover.
- An editor can modify and preview but cannot publish, unpublish, delete, invite, or create/revoke public links.
- An autosaved edit to a published story does not alter bytes or behavior returned to an existing recipient until Publish changes succeeds.
- A failed publish leaves both the draft and previous published pointer intact and reports actionable validation failures.
- Restoring any retained revision creates a new draft head and leaves the published story unchanged.

### Viewer and playback

- Swipe, visible controls, keyboard commands, and the page list reach every page and expose the same active-page state.
- The viewer starts paused on the cover unless valid URL state requests otherwise.
- Page playback, hidden-tab pause, delayed video, manual navigation during play, load timeout, replay, and reduced motion conform to the page-clock rules above in current Chromium, Firefox, and WebKit.
- At widths from 320 CSS pixels through desktop, no authored content is clipped by application chrome; the page is letterboxed and zoomable to 400%.
- The viewer is operable with keyboard and screen reader, has a meaningful reading order, and announces active page, playback state, load failure, and missing media.
- A blocked autoplay never stalls the page and always exposes a usable play control.

### Sharing

- Existing password, expiration, slug, revocation, metadata, and download behaviors are either reused or explicitly narrowed as specified; upload is not offered.
- Public access to a story never grants ordinary asset API access, adjacent assets, hidden metadata, faces, locations, or originals unless the share explicitly permits original download.
- `page`, `t`, and `play` can be added, removed, or modified without changing authorization; invalid values fail closed to the cover rather than producing an error or data leak.
- Share from here opens the same stable page and page-clock position within rounding tolerance; link revocation and expiration invalidate every variant.
- An unpublished page cannot be shared publicly; the author is offered Publish changes first.

### Responsive and resilience

- The full creation-to-share path is usable at 320, 375, 600, 768, 1024, and 1440 CSS pixel container widths, in portrait and landscape where applicable.
- A viewport resize, device rotation, virtual keyboard, or fold segment change preserves the current task, selected page/asset, and committed edits.
- Touch actions do not require hover or targets below 44 CSS pixels; all primary authoring tasks have non-drag alternatives.
- Reloading or losing the network during any step recovers acknowledged server state and clearly identifies unsent work according to the persistence specification.

## Explicitly deferred

- Native mobile applications and print output.
- Comments, reactions, simultaneous multiplayer editing, and recipient playback analytics visible to authors.
- Story-file download/export.
- Source-video seek/start/end/loop controls, audio policy customization, and video crop/effects.
- Semantic AI curation as a dependency; AI remains an optional alternative draft or editing assistant.
- Arbitrary themes, fonts, external stickers, and free-form public uploads.
