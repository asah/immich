# Photo and Album Conversations

**Status:** Design proposal

**Audience:** Product, web, server, security, operations, and documentation teams

## Summary

Add a conversation layer to photos and albums that works for authenticated users and, when explicitly enabled on a shared link, for public-link visitors. A conversation consists of:

- reactions from a fixed, extensible reaction catalog;
- comments with safe rich text, links, and emoji;
- reactions on comments;
- in-app notifications for relevant participants;
- at most one email digest per recipient per day.

The design extends the existing album/asset activity feature. It preserves the current rule that an asset conversation is only available when the asset belongs to the album, and it makes the shared-link boundary explicit rather than treating a public visitor as an ordinary user.

## Goals

1. Let people react to and comment on an individual photo, a selection of photos, or an album.
2. Support the full reaction set without coupling the UI to a single `like` boolean.
3. Make comments expressive but safe: formatting, links, and emoji, with no executable HTML.
4. Allow reactions on comments.
5. Notify people who are meaningfully engaged with the same photo or album.
6. Deliver email digests no more than once per recipient per local calendar day, with an idempotent delivery guard.
7. Work for signed-in users and anonymous shared-link visitors, subject to link-owner controls.
8. Give owners and moderators practical controls for deletion, reporting, blocking, and disabling participation.
9. Avoid leaking private album membership, email addresses, or asset metadata to public visitors.

## Non-goals for the first release

- direct messages or follower relationships;
- arbitrary custom reactions or user-uploaded stickers;
- nested comment threads;
- public search/indexing of comments or reactions;
- editing the original photo from a comment;
- a general-purpose notification center rewrite;
- real-time presence, typing indicators, or read receipts;
- requiring email verification before public commenting; verification is required only for email opt-in.

## Current state and constraints

The repository currently has:

- an `activity` table tied to an album and optionally an asset;
- `like` and plain-text `comment` activity types;
- one like per user per album/asset, enforced by a partial unique index;
- an in-app activity panel for authenticated album participants;
- album/asset access checks through `ActivityCreate`, `ActivityRead`, `ActivityDelete`, and related permissions;
- shared links that authenticate a visitor with a secret link token but do not currently expose activity creation;
- a notification table and websocket/in-app notification infrastructure;
- SMTP email delivery and user-level email preferences, currently focused on album invites/updates.

The existing `activity` check constraint assumes every row is either a like with no comment or a comment with no like. It must not be extended by simply adding more booleans. The data model should represent a reaction as a reaction value and a comment as a separate entity.

## Product model

### Conversation targets

There are two target levels:

| Target | Examples                       | Visibility                                    |
| ------ | ------------------------------ | --------------------------------------------- |
| Album  | “Our 2026 vacation”            | The album conversation and aggregate activity |
| Asset  | A photo/video inside the album | The asset conversation and activity           |

An asset comment or reaction always carries its album context. This prevents the same asset appearing in multiple albums from accidentally sharing conversation history between unrelated audiences.

### Actors

1. **Authenticated participant** — an Immich user with album read access and, when enabled, activity-create access.
2. **Shared-link visitor** — anonymous or pseudonymous visitor using a valid shared-link token. They receive a link-scoped display name and avatar color, not an Immich user identity.
3. **Album owner/moderator** — the owner, and optionally album editors, who can moderate content according to album settings.
4. **System** — creates in-app notification records and email digest jobs; it never becomes a visible commenter.

Public participation is opt-in per shared link. A private album must never become commentable merely because a shared link exists.

### Reaction catalog

Reactions should be expansive rather than limited to seven choices. Use a server-owned catalog of popular Unicode emoji and semantic reaction keys, with room for the catalog to grow without a database migration. The initial catalog should include at least:

`like`, `love`, `haha`, `wow`, `sad`, `angry`, `celebrate`, `heart_eyes`, `congratulations`, `thanks`, `party`, `fire`, `clap`, `eyes`, `pray`, `thinking`, `rocket`, `star`, `thumbs_up`, `thumbs_down`, `red_heart`, `white_heart`, `blue_heart`, `green_heart`, `yellow_heart`, `purple_heart`, `broken_heart`, `laughing`, `crying`, `surprised`, `confused`, `cool`, `fingers_crossed`, and `tada`.

The picker should have a small “quick reactions” row containing the most-used reactions, followed by search and categorized browsing. Recent reactions are per-user and local to the device/account. This gives popular emoji a one-click path without making the overall catalog artificially small. The server stores stable reaction keys, not translated labels or emoji glyphs. The client owns presentation, ordering, skin-tone policy, and localization. A reaction is one key per actor per target; changing a reaction replaces the prior reaction, and choosing the active reaction removes it. Unsupported or disabled reaction keys must be rejected server-side.

### Comment content

Comments use a small Markdown-like rich-text dialect serialized as a versioned document, for example:

```json
{
  "version": 1,
  "blocks": [
    {
      "type": "paragraph",
      "children": [
        { "text": "Great light! See ", "marks": [] },
        { "text": "the location", "marks": ["link"], "href": "https://example.com" }
      ]
    }
  ]
}
```

Supported first-release features:

- paragraphs and line breaks;
- bold, italic, strikethrough, and inline code;
- ordered and unordered lists;
- links with `https` and optionally `http` schemes;
- emoji inserted from the platform picker or typed as Unicode.

Not supported in the first release: raw HTML, images, embeds, tables, mentions, arbitrary CSS, javascript URLs, data URLs, and automatic unfurling. Links open with safe attributes and are rendered with a visible external-link treatment. The server validates and sanitizes the document before persistence and the client renders only the sanitized representation.

Plain text should remain a valid import/export representation so older clients can display a readable fallback.

### Photos in comments

Commenters with upload privileges may attach photos to a comment while discussing the current photo. An attachment is a reference to an Immich asset, not a second file stored inside the comment.

The composer provides two paths:

1. **Upload and attach** — available only when the commenter has the conversation’s upload privilege. The upload uses the existing shared-link or authenticated upload flow, runs through normal checksum/deduplication, and then attaches the resulting existing or newly-created asset to the comment.
2. **Search and attach** — available to authenticated users for assets they are authorized to see, and to public visitors only for assets already exposed through the current shared link. Search is server-side and returns a small result set with thumbnails; it never becomes a library-wide search endpoint for anonymous visitors.

Each attachment is rendered as a tiny thumbnail in the comment. Clicking it opens an in-context lightbox; a “view photo” action links to the photo’s album/asset route when the viewer has access. If access is later revoked, the thumbnail becomes an unavailable-attachment tombstone rather than leaking the asset.

Uploads must be deduplicated by the normal asset checksum pipeline before attachment creation. If the upload matches an existing asset that the commenter is allowed to reference, attach that asset and do not create a second copy. If a duplicate is found but is not visible in the conversation, do not reveal that it exists; return a generic upload result and keep the attachment unlinked.

Attachment limits should be configurable and conservative initially: 4 photos per comment, 20 MB per uploaded photo before normal upload limits, and no video attachments in the first release. The comment mutation is idempotent, so a retry cannot create duplicate attachment rows.

Selection commenting remains per-photo. If the user attaches a photo while commenting on several selected photos, create one independent comment per selected target and attach the same authorized asset reference to each comment.

## User experience

### Authenticated users

On album and asset views, show a conversation control beside the existing activity/comment control. The panel contains:

- a target header showing album or photo context;
- reaction summary grouped by reaction key, with an accessible picker;
- the comment list, newest-first or oldest-first consistently (recommend oldest-first with “new activity” jump);
- a rich comment composer with formatting, link, emoji, submit, cancel, and character count;
- upload and search-photo controls when the commenter has the required capability;
- tiny attachment thumbnails with expand and “view photo” actions;
- comment overflow actions: edit/delete for the author, delete/report for moderators;
- reaction picker on each comment;
- a “load more” cursor rather than unbounded rendering.

For a selected set of photos, expose a deliberate “React to selection” and “Comment on selection” action. Selection commenting is per-photo: the composer shows the selected photos, and submitting creates one comment in each selected photo conversation. The UI must show the number of comments that will be created and require confirmation for multiple targets. Each photo gets its own notification fan-out; there is no synthetic album comment and no hidden duplication.

### Public shared-link visitors

When the link owner enables participation, show the same conversation controls with these differences:

- visitor must enter a display name before first participation;
- email verification is required only when the visitor opts into email notifications; comments and reactions can be posted without email verification;
- the display name is link-scoped and can be changed by the visitor only with a signed visitor cookie/token;
- no link visitor sees the owner’s private user email or other album membership details;
- the owner can disable comments, reactions, or both independently;
- the owner can require approval for first comment/reaction from a visitor;
- moderation tools can revoke a visitor token and remove all content from that visitor on the link.

The owner, album editors, and instance administrators get a one-click hide/unhide control. Hiding is global for the conversation: the comment disappears for everyone, while the author sees a clear hidden state where appropriate. An instance administrator can hide or unhide any comment across the installation, regardless of album role.

If a shared link is copied, the visitor identity is still scoped to that link. This prevents cross-link tracking and makes revocation meaningful.

### Accessibility and localization

- Reaction buttons have localized names and expose selected state through `aria-pressed`.
- Emoji is supplementary; every reaction has a text label.
- The editor is keyboard navigable and has a plain-text fallback.
- Color is not the only indicator for reaction state or moderation state.
- Right-to-left text, long URLs, large font settings, reduced motion, and screen-reader announcements are first-class test cases.
- Relative timestamps include an exact timestamp tooltip.

## Notification rules

### In-app notifications

Create an in-app notification for:

- a new reaction or comment on an asset, to the asset owner and people engaged with that asset;
- a new reaction or comment on an album, to the album owner and people engaged with that album;
- a reaction on a comment, to the comment author and other engaged participants when they are not the actor;
- moderation actions that affect a user’s own content.

Comments classified as risky by automated moderation are excluded from participant notifications. Instance administrators receive a separate flagged-comment notification and can review, unhide, or permanently delete the comment.

The actor never receives a notification for their own action. Duplicate events in a short burst should be coalesced in the UI and in the digest.

### Engagement definition

For an asset, a person becomes engaged when they:

- react to the asset;
- comment on the asset;
- react to a comment on the asset; or
- are the asset owner or album owner and have access to the conversation.

For an album, a person becomes engaged when they:

- react to or comment on the album;
- react to a comment on the album; or
- open at least three distinct assets in that album during one browsing session.

Opening three photos is an eligibility signal, not a notification by itself. The session ends after the client is closed or becomes inactive for 30 minutes; it is not accumulated across sessions. This avoids notifying people merely because they browsed one shared photo. The owner and anyone with a current album role can opt out; removed users and revoked shared-link visitors stop receiving notifications immediately.

The system should store an engagement record with `firstEngagedAt`, `lastEngagedAt`, `source`, and a privacy-safe actor reference. Do not derive recipients by scanning all activity at send time; explicit records make revocation and retention manageable.

### Email digest

Email is opt-in per user and requires a verified email address. Use a fixed local-time delivery window, recommended at 09:00 in the recipient’s timezone. A recipient gets at most one conversation digest per local calendar day. Also use a per-user delivery lease and an idempotency key so clock changes, retries, and server restarts cannot create duplicates.

Recommended behavior:

- default delivery window: the user’s configured timezone, at 09:00 local time;
- if no timezone is configured, use server timezone and make that visible in settings;
- aggregate by album, then by asset;
- include actor display names, reaction counts, comment excerpts, thumbnails only when the recipient has access, and deep links back to the authenticated app or shared link;
- include at most one small access-checked attachment thumbnail per comment, with a link to the conversation; never attach or embed the original upload in email;
- never include content from an access that was revoked after the event;
- changing email preferences takes effect before the digest is rendered, not merely when the event is queued;
- a digest with no eligible items is not sent.

“At most once per day” is enforced per recipient, not globally. A user may receive a digest today for one album and no second digest for another album until the window passes.

Flagged comments never appear in participant digests. Administrators receive a distinct flagged-comments digest containing the comment, risk category, model explanation, source link, and one-click hide/unhide/delete actions. It is subject to the same once-per-day delivery limit, but is tracked separately from ordinary participant digests so an admin can receive both categories on the same day.

## Data model proposal

Retain `activity` only through a migration period, then replace it with these concepts:

### `conversation`

- `id`
- `albumId`
- `assetId` nullable (null means album conversation)
- `status` (`enabled`, `disabled`, `archived`)
- `createdAt`, `updatedAt`
- unique key on `(albumId, assetId)` with a nullable-asset strategy that guarantees one album conversation

### `reaction`

- `id`
- `conversationId`
- `commentId` nullable (null means target reaction; otherwise comment reaction)
- `actorUserId` nullable
- `visitorId` nullable
- `reactionKey`
- `createdAt`, `updatedAt`
- exactly one actor identity; unique `(conversationId, commentId, actorUserId)` and equivalent visitor key
- check constraint requiring either a user or visitor actor
- foreign keys cascade on conversation/comment deletion

### `comment`

- `id`
- `conversationId`
- `authorUserId` nullable
- `visitorId` nullable
- `bodyDocument` JSONB
- `bodyText` normalized plain-text projection for search, moderation, and digest fallback
- `bodyVersion`
- `moderationState` (`visible`, `pending`, `hidden`, `deleted`, `quarantined`)
- `moderationRisk` (`none`, `low`, `medium`, `high`, `critical`)
- `moderationSource` (`none`, `llm`, `admin`)
- `moderationReviewedAt`, `moderationReviewedBy`
- `createdAt`, `updatedAt`, `deletedAt`
- exactly one author identity

### `conversation_visitor`

- `id`
- `sharedLinkId`
- opaque token hash, never the raw token
- display name
- optional verified email and verification timestamp
- `lastSeenAt`, `revokedAt`
- rate-limit counters or references to a rate-limit store

### `comment_asset`

- `commentId`
- `assetId`
- `position`
- `createdAt`
- unique `(commentId, assetId)`

The asset remains governed by its normal owner, album, and shared-link permissions. Deleting a comment removes the reference, not the asset. Deleting or hiding an asset makes the attachment unavailable without exposing a replacement URL.

### `engagement`

- `id`
- `userId` or visitor id
- conversation/album scope and optional asset scope
- `source`
- `firstEngagedAt`, `lastEngagedAt`
- `notificationsEnabled`
- `nextDigestAt`, `lastDigestSentAt`
- unique actor/scope key

### `conversation_event`

- immutable event id and event type;
- actor identity;
- conversation, asset, and comment references;
- event payload version;
- created time;
- digest delivery state/idempotency key.

Events should be retained separately from rendered notifications so multiple in-app and email projections can be rebuilt without mutating conversation records.

### `comment_moderation`

- `commentId`
- model/provider identifier and policy version
- risk score and categories
- short explanation suitable for an administrator
- `decision` (`allow`, `suppress_notifications`, `auto_hide`)
- `createdAt`
- model input/output hashes for audit without retaining duplicate full prompt text

Comments, moderation decisions, events, and engagement records are retained forever by policy, but the rows should stay compact: store normalized text/document once, use foreign-key references from events, and avoid copying comment bodies into every notification. Deleting a visitor’s content leaves a minimal tombstone and moderation audit record without retaining the deleted body in rendered notifications.

## API proposal

Introduce a versioned conversation API rather than expanding `/activity` indefinitely:

```text
GET    /conversations/{id}
GET    /conversations/{id}/comments?cursor=&limit=
GET    /conversations/{id}/reactions
POST   /conversations/{id}/comments
PATCH  /conversations/{id}/comments/{commentId}
DELETE /conversations/{id}/comments/{commentId}
PUT    /conversations/{id}/reactions/{reactionKey}
DELETE /conversations/{id}/reactions/{reactionKey}
PUT    /conversations/{id}/comments/{commentId}/reactions/{reactionKey}
DELETE /conversations/{id}/comments/{commentId}/reactions/{reactionKey}
POST   /shared-links/{id}/conversation-visitors
POST   /shared-links/{id}/conversation-visitors/verify-email
GET    /conversations/{id}/attachment-search?q=&cursor=&limit=
POST   /conversations/{id}/attachments/upload-session
POST   /conversations/{id}/comments/{commentId}/assets
DELETE /conversations/{id}/comments/{commentId}/assets/{assetId}
```

The API must return capability flags with each conversation:

```json
{
  "canReact": true,
  "canComment": true,
  "canEditOwnComment": true,
  "canModerate": false,
  "canUploadAttachment": false,
  "canSearchAttachments": true,
  "requiresVisitorApproval": false
}
```

All mutation endpoints need idempotency support. A client retry must not create duplicate comments or reactions.

## Security, privacy, and abuse controls

- Shared-link participation is disabled by default for existing and new links unless product explicitly chooses otherwise.
- Separate read access from participate access.
- Use opaque visitor IDs and hashed visitor tokens; never expose raw tokens in logs or notification payloads.
- Rate-limit by visitor token, IP/network bucket, user, and conversation. Apply stricter limits to anonymous comments than reactions.
- Add spam heuristics: repeated URLs, excessive length, burst posting, duplicate bodies, and known malicious domains.
- Sanitize server-side and render from the sanitized AST. Link allowlisting must reject `javascript:`, `data:`, `file:`, and custom schemes.
- Report and block controls are required before public participation is enabled broadly.
- Run every new or edited comment through a simple, instance-configured LLM moderation job. The classifier returns risk categories and a calibrated risk level; it is advisory for low/medium risk and policy-enforcing for high/critical risk.
- Suppress risky comments from participant in-app notifications and all participant email digests. Send them only to instance administrators in a distinct flagged-comment notification.
- Automatically hide super-risky/critical comments by default. Do not deliver them to participants until an administrator explicitly unhides them.
- Provide one-click global hide/unhide for administrators and album-editor moderation for comments in their albums. Every manual decision is audited and overrides the model decision.
- If the LLM is unavailable, accept the comment but mark it `pending` and suppress participant notifications until moderation completes; administrators receive the pending item through the moderation queue. This avoids turning a model outage into a data-loss path.
- Do not send private comments or full album context to a third-party model by default. Prefer a local model; if a remote provider is configured, require explicit admin consent, redact unnecessary identities/URLs, and document retention and processing location.
- Album owners can delete, quarantine, and revoke a visitor. Moderation actions are audited.
- Deleted comments remain as a tombstone where necessary to preserve reaction/thread context, but their body is not recoverable by clients.
- Do not put private photo URLs into email unless the recipient has an authenticated deep link or the product explicitly accepts expiring signed links.
- Attachment search for a public visitor is restricted to assets exposed by the current shared link; never use the visitor’s query to confirm whether another private asset exists.
- Upload privilege must be checked at upload-session creation and again when the attachment is committed. A visitor cannot upload to one link and attach the asset to a different link without authorization.
- Deduplication responses must not reveal that a private asset already exists. Return only an attachable existing asset or a generic non-attachable result.
- Attachment thumbnails in notifications and email are generated through the same access-checked media path as the conversation, with no long-lived public asset URL.
- CSRF, origin checks, and token binding apply to shared-link mutation endpoints.
- Add privacy settings for discovery by email: no public directory or user lookup is required.

## Email and notification settings

Extend user preferences with:

```text
conversationNotifications.inApp
conversationNotifications.emailDigest
conversationNotifications.emailDigestTime
conversationNotifications.reactions
conversationNotifications.comments
conversationNotifications.commentReactions
conversationNotifications.albumEngagementThreshold
```

Add shared-link settings:

```text
allowReactions
allowComments
requireVisitorApproval
allowVisitorEmailOptIn
```

Instance moderation settings:

```text
conversationModeration.enabled
conversationModeration.provider
conversationModeration.autoHideThreshold
conversationModeration.suppressNotificationsThreshold
conversationModeration.adminDigestEnabled
conversationModeration.maxModelLatency
```

Admin settings should cover SMTP availability, maximum comment size, maximum links per comment, daily digest batch size, retention period, and whether public participation is allowed instance-wide.

## Rollout plan

### Phase 0 — foundations

- Define reaction catalog, capability model, sanitized document schema, and migration strategy.
- Add security threat model, abuse test fixtures, and LLM moderation policy/versioning.
- Add feature flags and telemetry counters without exposing the feature.

### Phase 1 — authenticated conversations

- Migrate existing likes/comments into conversations.
- Add rich comments, reaction picker, comment reactions, edit/delete, and in-app notifications.
- Add comment photo attachments, upload-privilege checks, checksum deduplication, and authorized attachment search.
- Keep album-level and asset-level access checks.
- Add email digest behind a per-user opt-in flag, with a fixed local-time delivery window.
- Add comment moderation, admin-only flagged notifications, and one-click hide/unhide.

### Phase 2 — public shared links

- Add per-link participation controls and visitor identity.
- Add optional visitor email verification, moderation, rate limits, reporting, and abuse dashboards. Do not require verification for ordinary comments or reactions.
- Enable only for explicitly opted-in links.

### Phase 3 — digest maturity

- Add one-session engagement threshold tracking for three-photo album opens.
- Add localized, thumbnail-aware digest templates.
- Add delivery metrics, retries, bounce handling, and user-facing digest previews.

### Migration and compatibility

- Backfill one conversation per existing album and asset activity scope.
- Convert existing likes into `reactionKey = like`.
- Convert existing plain comments into one-paragraph documents.
- Preserve activity IDs through a legacy reference column so old clients can delete their own content during the compatibility window.
- Keep old endpoints read-only for one release, then remove them after client adoption telemetry is sufficient.

## Testing and acceptance criteria

### Product behavior

- A user can add, replace, and remove each supported reaction on an album, photo, and comment.
- A user can compose, edit, delete, and render every supported formatting feature.
- A public visitor can participate without email verification when the link permits it; email verification is required only for email opt-in.
- A user never receives their own activity notification.
- A user who opens only one album photo is not added to the album-engagement recipient set; three distinct photo opens in one session are required, and opens from earlier sessions do not count.
- A multi-photo comment creates one independent comment per selected photo and never creates an implicit album comment.
- A commenter with upload privilege can upload and attach a photo without creating a duplicate asset when the checksum matches an attachable existing asset.
- A commenter can search only the photos they are authorized to reference; a public visitor cannot use attachment search to probe private library contents.
- Comment attachments render as tiny thumbnails, expand in context, and expose a permission-checked photo link.
- An administrator can hide or unhide any comment for everyone with one action; album editors can do the same within their albums.
- Low/medium-risk comments may appear normally; risky comments are excluded from participant notifications; critical comments are hidden automatically and sent only to administrators for review.
- A recipient receives no more than one digest per local calendar day, including retries and server restarts.

### Security and reliability

- Unauthorized users cannot read or mutate conversations.
- Sanitization tests reject script URLs, HTML injection, CSS injection, and dangerous Unicode control characters.
- Rate-limit and idempotency tests cover anonymous and authenticated clients.
- Notification fan-out is bounded and asynchronous; a reaction request does not wait for email delivery.
- Revoking album/link access removes future in-app and email eligibility.
- Database migration and rollback are tested against existing activity rows.

### Accessibility and client compatibility

- Keyboard-only reaction/comment flow works.
- Screen readers announce reaction state, validation errors, and newly loaded comments.
- Mobile, desktop, RTL, reduced motion, long links, and large text are covered in web tests.
- Old clients continue to display a readable plain-text comment fallback.

## Resolved product decisions

1. Use an expansive reaction catalog with a quick-access popular row, search, and categories.
2. Require visitor email verification only for email notification opt-in.
3. Selection comments are created independently per selected photo.
4. Album editors have moderation powers within their albums; instance administrators have global hide/unhide powers.
5. Three distinct photo opens count only within one browsing session, not across sessions.
6. Use a fixed local-time digest window at 09:00, protected by a per-recipient idempotent daily lease.
7. Retain comments, moderation events, and engagement records forever, using compact normalized records and tombstones for deleted visitor content.

## Expert panel review

The following independent reviews were performed against the proposal before implementation planning.

### Product manager

**Findings**

- “React to selection” is ambiguous and risks multiplying notifications.
- Public participation needs a clear owner-facing switch and safe default.
- The difference between album engagement and asset engagement must be visible to users.
- A daily digest needs a clear user expectation and a way to disable it.

**Resolution**

- The reaction picker has popular quick reactions plus expansive search/categories. Selection comments fan out explicitly per photo and show the resulting count before confirmation.
- Public participation is opt-in per link and instance policy.
- Engagement rules are explicit and settings are proposed.
- Digest preferences and a fixed local-time delivery window are part of the design, not a hidden admin-only behavior.

### UX and accessibility specialist

**Findings**

- A reaction picker alone is insufficient; selected state, keyboard operation, labels, and a fallback are needed.
- Rich text can make comment editing and moderation confusing if raw HTML is allowed.
- Public visitor identity must be established before the composer becomes active.
- Large comment lists need cursors and a stable ordering model.

**Resolution**

- The design specifies accessible reaction controls, a constrained document model, a visitor setup step, and cursor pagination.
- Oldest-first with a “new activity” affordance is recommended to preserve conversation flow while avoiding an ever-moving feed.
- One comment per selected photo is shown explicitly before submission so the fan-out is understandable.

### Security and privacy specialist

**Findings**

- Anonymous commenting is an abuse surface, especially with shared links that are forwarded.
- Raw HTML, URL schemes, email addresses, and notification deep links can leak data or create XSS/phishing paths.
- A visitor identity must be link-scoped and revocable.
- Email recipients must be re-authorized at send time.

**Resolution**

- The proposal adds link-scoped visitor IDs, token hashing, rate limits, approval, moderation, sanitization, safe schemes, and access checks at digest rendering.
- The design explicitly avoids global anonymous identities and private URLs in email.
- LLM moderation is privacy-bounded, fails closed for notifications, auto-hides critical content, and provides administrator override controls.

### Backend and data specialist

**Findings**

- The existing activity check constraint cannot model multiple reactions or comment reactions cleanly.
- Notification fan-out should not be synchronous with the write request.
- Album/asset scope must remain separate because the same asset can occur in multiple albums.
- Idempotency is required for mobile retry behavior.

**Resolution**

- Conversations, comments, reactions, engagement, and immutable events are separate entities.
- Notification and email work is queued asynchronously.
- The API uses conversation IDs and idempotency keys.
- Migration and compatibility behavior is defined.
- Per-photo selection fan-out is explicit and event-driven; moderation results are versioned and compact.

### Email and operations specialist

**Findings**

- “Once per day” is ambiguous across timezones, retries, and multiple events.
- Digest templates need thumbnails and access-safe links, but should not become a privacy leak.
- SMTP failures, bounce behavior, and batch size need operational controls.

**Resolution**

- Use a 09:00 local-time delivery window protected by a per-user daily lease and idempotency key.
- Render at send time, cap batch size, and expose operational settings/metrics.
- Email is opt-in and requires a verified address.
- Send a separate daily flagged-comment digest to administrators.

### Community and moderation specialist

**Findings**

- Reporting and blocking are necessary before public comments can be enabled safely.
- Owners need to understand whether deleting a comment also deletes its reactions.
- Moderation actions need an audit trail and predictable tombstones.

**Resolution**

- Reporting, visitor revocation, moderation states, audit events, and tombstones are included in the foundation rather than deferred indefinitely.
- Deleting a comment removes its body and child reactions while preserving a minimal deleted marker where conversation ordering requires it.
- Album editors can moderate within their albums; administrators can hide/unhide globally with one click. Critical automated flags are hidden by default.

### Media storage and search specialist

**Findings**

- Storing a second copy inside a comment would break asset lifecycle, deduplication, and permission guarantees.
- Public attachment search could become an accidental private-library oracle.
- A successful upload must not be reported as a duplicate if the matching asset is outside the visitor’s authorized scope.
- Email and notification thumbnails need the same authorization checks as the live conversation.

**Resolution**

- Comments store asset references only; uploads enter the normal asset/checksum pipeline before attachment.
- Search is scoped to the current link or authenticated access set, and deduplication results are capability-filtered.
- Attachment thumbnails and links are rendered through access-checked media URLs and become tombstones after revocation.

## Recommendation

Approve Phase 0 and Phase 1 as the first implementation slice. Include comment attachments and scoped attachment search in the authenticated conversation foundation, then expose uploads to public visitors only when the shared link’s existing upload privilege is enabled. Do not enable public shared-link participation until the visitor identity, rate limiting, sanitization, reporting, moderation, revocation, and attachment authorization paths are implemented and tested. The highest-risk implementation concern is the LLM moderation and notification boundary: model failures must not publish risky content to participants, and administrators must retain a simple override path.
