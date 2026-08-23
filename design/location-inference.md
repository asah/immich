# Conservative location inference for untagged assets

## Decision

Add an opt-in, review-first workflow that proposes a GPS coordinate only for an asset with no existing GPS location. It must never silently change the original media file. An accepted proposal updates Immich's database and writes an XMP sidecar; the sidecar carries GPS coordinates and a small, non-PII provenance record.

This intentionally treats inference as an edit, not metadata extraction. A camera GPS coordinate is evidence; a nearby photo is only a prediction.

## What exists today

Immich's metadata extraction already reverse-geocodes a present coordinate into city, state, and country when reverse geocoding is enabled. Album location grouping should use that locality first. Immich currently writes edited locations to XMP sidecars using `exif:GPSLatitude` and `exif:GPSLongitude`, rather than modifying the original media. [Immich XMP sidecars](https://docs.immich.app/features/xmp-sidecars/) documents both the fields and the write-back behavior.

That is the right persistence model for inferred locations too: sidecars are format-independent, merge with existing metadata, and avoid rewriting a JPEG, RAW, or video. Read-only external libraries cannot support the write-back portion, so those assets may receive a preview but cannot be applied. [Immich external libraries](https://docs.immich.app/features/libraries/) documents this constraint.

## User experience

1. A new **Find missing locations** action scans only assets owned by the requesting user that have no GPS coordinates.
2. It presents high-confidence candidates in a review queue. Each card shows a map pin, accuracy radius, capture-time window, confidence, and a neutral explanation such as “consistent with 3 photos captured within 18 minutes.” It never exposes a source filename, album, user, or sharing relationship.
3. The user can accept, adjust the pin, reject, or defer each proposal. A bulk **Apply high-confidence** action remains explicitly confirmable and reports how many sidecars will be written.
4. Accepted coordinates become normal editable location metadata. The asset details panel labels them **Inferred by Immich** and offers **Revert inferred location**.
5. Rejected or manually edited assets are never proposed again unless the user explicitly re-runs inference after clearing that decision.

No inference is shown to album collaborators, partners, shared-link visitors, or other owners unless they can already view the target asset's location.

## Eligibility and confidence

The first version deliberately uses a narrow, explainable model.

- Same owner only. Never use shared albums, partner assets, faces, people, visual similarity, upload folder, filenames, or upload time as evidence.
- Target must have a trusted capture time (`localDateTime` sourced from capture metadata) and no GPS coordinates, including no manually cleared-location marker.
- Candidate sources must have existing, non-inferred GPS and a capture time within 30 minutes of the target. Sources with an uncertain or fallback timestamp are excluded.
- Require at least two independent source assets, unless a future explicit “single-source burst” mode is enabled.
- Compute a robust geographic medoid, then require every supporting coordinate to fall within 500 m of it. The proposed accuracy radius is the 95th-percentile candidate distance plus a 100 m floor.
- Require a confidence score of at least 0.95. Score is based only on temporal proximity, candidate count, geographic dispersion, and source-coordinate precision. There is no guessed coordinate when candidates disagree, cross 500 m, or cross the date-line/other numerical edge cases.
- Reverse-geocode the final coordinate only after it passes the geographic test. The result is a display locality, not evidence for the coordinate.

These thresholds favor false negatives over false positives. A “golden hour” cluster is useful for grouping but is not enough to geotag an asset.

## Data model and provenance

Introduce `asset_location_inference` rather than overloading EXIF fields:

| Field | Purpose |
| --- | --- |
| `assetId` | Target asset. |
| `latitude`, `longitude`, `accuracyMeters` | Proposed or accepted coordinate and uncertainty. |
| `status` | `proposed`, `accepted`, `rejected`, `reverted`, or `stale`. |
| `algorithmVersion`, `confidence`, `createdAt`, `acceptedAt` | Reproducibility and auditing. |
| `sourceAssetIds` | Internal-only UUIDs for recomputation and review; never returned to unprivileged clients or written as filenames. |
| `evidenceSummary` | Non-PII counts/window/dispersion used in the UI. |

On acceptance, copy coordinates into the canonical EXIF/database location fields and queue the existing sidecar-write job. Add a private `immich:` XMP namespace for `LocationInferred`, algorithm version, confidence, accepted time, and an opaque inference-record ID. Do not put source asset IDs, paths, filenames, album IDs, or person IDs in XMP. The opaque record links only to a local database record and is safe to omit on export.

The GPS write should set latitude and longitude together, including their hemisphere/reference values. This aligns with ExifTool's GPS guidance and keeps EXIF/XMP coordinate representations complete. [ExifTool GPS tag documentation](https://exiftool.org/TagNames/GPS.html)

## Jobs and lifecycle

- `LOCATION_INFERENCE`: creates or refreshes proposals after metadata extraction, an explicit user scan, or an approved metadata-location change.
- `SIDECAR_WRITE`: runs only after acceptance, reusing Immich's current write path.
- Any manual location edit wins permanently: mark a pending proposal stale and do not overwrite it.
- If a supporting source is edited, deleted, or loses GPS, mark dependent proposals stale. Accepted locations are preserved but shown as “evidence changed” until reviewed; they are never automatically moved.
- Rate-limit reverse geocoding, cache coordinate-to-locality results, and use Immich's local reverse-geocoder where available. Do not batch against the public Nominatim endpoint: its policy limits heavy use and requires attribution/identification. [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)

## Security, privacy, and operational safeguards

- Feature is disabled by default and opt-in per user; administrators may disable it globally.
- The job is tenant/owner scoped and must apply normal asset visibility checks at every query.
- No network geocoding is required for candidate selection. If an external geocoder is configured, it is disclosed in settings before use.
- Preview first; one explicit confirmation is required before any database or sidecar write. Offer a downloadable change report containing target asset IDs only.
- Preserve a reversible snapshot of the prior canonical location fields and sidecar values. Never overwrite original embedded EXIF.
- Emit structured audit events for proposal, acceptance, rejection, reversion, and sidecar-write failure.

## Delivery plan

1. Add schema, owner-scoped candidate query, deterministic medoid/confidence unit tests, and a no-write proposal API.
2. Build the review queue and decisions; test access control and stale-evidence behavior.
3. Add acceptance/revert, sidecar provenance, job orchestration, and read-only-library handling.
4. Run a private beta with telemetry limited to outcome counts and error classes; evaluate precision from accepted vs. rejected proposals before relaxing any threshold.

## Open decisions

- Whether one source in a tightly bounded camera burst deserves its own explicit, opt-in mode.
- Exact custom XMP namespace and whether opaque inference IDs should be emitted at all, versus retaining provenance solely in the database.
- Whether accepted inferred locations should be included by default in exports; privacy-first behavior is to exclude the custom provenance marker while retaining coordinates only when the user asks to export location metadata.
