<script lang="ts">
  import { locale, type AlbumAssetDisplayInfo } from '$lib/stores/preferences.store';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import type { AssetResponseDto } from '@immich/sdk';
  import { DateTime } from 'luxon';

  type Props = {
    asset: AssetResponseDto;
    settings: AlbumAssetDisplayInfo;
    placement?: 'overlay' | 'below';
    expanded?: boolean;
    onToggleExpanded?: (() => void) | undefined;
    instantCameraStyle?: boolean;
  };

  const {
    asset,
    settings,
    placement = 'overlay',
    expanded = false,
    onToggleExpanded = undefined,
    instantCameraStyle = false,
  }: Props = $props();
  const dateTime = $derived(DateTime.fromISO(asset.localDateTime, { locale: $locale }));
  const fileSize = $derived(
    settings.fileSize && asset.exifInfo?.fileSizeInByte
      ? getByteUnitString(asset.exifInfo.fileSizeInByte, $locale)
      : '',
  );

  const values = $derived.by(() => {
    const exif = asset.exifInfo;
    const cameraSettings = [
      exif?.exposureTime ? `${exif.exposureTime} s` : '',
      exif?.fNumber ? `f/${exif.fNumber}` : '',
      exif?.iso ? `ISO ${exif.iso}` : '',
    ].filter(Boolean);

    const dateAndTime = [
      settings.date && dateTime.isValid ? dateTime.toLocaleString(DateTime.DATE_MED) : '',
      settings.time && dateTime.isValid ? dateTime.toLocaleString(DateTime.TIME_SIMPLE) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const camera = [
      settings.camera ? [exif?.make, exif?.model].filter(Boolean).join(' ') : '',
      settings.cameraSettings ? cameraSettings.join(' · ') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const lens = [
      settings.lens ? exif?.lensModel || '' : '',
      settings.lensSettings && exif?.focalLength ? `${exif.focalLength} mm` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return [
      settings.location ? [exif?.city, exif?.state, exif?.country].filter(Boolean).join(', ') : '',
      dateAndTime,
      settings.filename ? asset.originalFileName : '',
      settings.description ? exif?.description?.trim() || '' : '',
      camera,
      lens,
    ].filter(Boolean);
  });
  const description = $derived(asset.exifInfo?.description?.trim() || '');
  // This is deliberately approximate: captions use a fixed one-line footer, and
  // the full text remains available in the asset viewer.
  const hasMore = $derived(description.length > 96);
</script>

{#if fileSize && placement === 'overlay'}
  <div class="absolute top-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-white shadow">
    {fileSize}
  </div>
{/if}

{#if placement === 'below' && description}
  <div
    class={`flex min-h-8 items-center gap-1 border-x border-b px-2 text-left text-xs ${instantCameraStyle ? 'border-white bg-white text-black' : 'border-subtle bg-subtle text-immich-fg dark:text-immich-dark-fg'}`}
  >
    <span class:line-clamp-3={expanded} class="min-w-0 flex-1" title={description}>{description}</span>
    {#if hasMore && onToggleExpanded}
      <button
        type="button"
        class="shrink-0 text-primary hover:underline"
        aria-expanded={expanded}
        onclick={onToggleExpanded}
      >{expanded ? 'Less' : 'More…'}</button>
    {/if}
  </div>
{:else if placement === 'overlay' && values.length > 0}
  <div
    class="pointer-events-none absolute bottom-0 w-full overflow-clip bg-black/70 p-1 text-center text-xs font-semibold text-ellipsis text-white"
  >
    {#each values as value, index (`${index}-${value}`)}
      <div class="truncate" title={value}>{value}</div>
    {/each}
  </div>
{/if}
