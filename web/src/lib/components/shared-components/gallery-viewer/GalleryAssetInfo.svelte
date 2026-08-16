<script lang="ts">
  import { locale, type AlbumAssetDisplayInfo } from '$lib/stores/preferences.store';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import type { AssetResponseDto } from '@immich/sdk';
  import { DateTime } from 'luxon';

  type Props = {
    asset: AssetResponseDto;
    settings: AlbumAssetDisplayInfo;
  };

  const { asset, settings }: Props = $props();
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
</script>

{#if fileSize}
  <div class="absolute top-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-white shadow">
    {fileSize}
  </div>
{/if}

{#if values.length > 0}
  <div
    class="absolute bottom-0 w-full overflow-clip bg-slate-50/80 bg-linear-to-t p-1 text-center text-xs font-semibold text-ellipsis dark:bg-slate-800/80"
  >
    {#each values as value, index (`${index}-${value}`)}
      <div class="truncate" title={value}>{value}</div>
    {/each}
  </div>
{/if}
