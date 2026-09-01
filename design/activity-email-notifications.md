# Shared-media email notifications

## Product decision

Email should be useful social context, not an activity firehose. Owners receive comment and reaction notices by default; people who have participated in the same shared photo or album receive later relevant activity by default. Actors never notify themselves. Activity notices reveal only the actor, action, and album name—never comment content, filename, or precise location.

This follows platform notification guidance to keep notices timely, concise, relevant, and privacy-preserving, while avoiding repeated alerts for the same item. See [Apple's notification guidance](https://developer.apple.com/design/human-interface-guidelines/notifications?changes=__6_4&language=objc).

## Controls and delivery

- One email master switch, then independent album invite, album update, shared activity, comment, reaction, and photo-description controls.
- Activity defaults on for new and existing users through preference defaults. Owners and prior participants are automatically selected as recipients, but each person remains in control of email delivery.
- `Immediate`, `Hourly`, and `Daily` delivery are supported. The latter two coalesce to the latest relevant event per album and recipient; this prevents bursts while preserving a clear call to action. A full multi-event digest is deliberately deferred until there is a durable digest store and a digest preview.
- Every activity email contains a direct link to the shared item and a direct link to Notification settings.

## Scope

This implementation covers comments, reactions, non-owner photo-description edits, and existing album invite/update email. Other metadata edits are intentionally not mailed yet: they are usually batch maintenance and need an explicit shared-editor policy. They should be added under a separate `Metadata changes` preference—not folded into reactions/comments.
