<script lang="ts">
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { SlideshowMetadataOverlayMode, slideshowStore } from '$lib/stores/slideshow.store';
  import { fromISODateTime, fromISODateTimeUTC } from '$lib/utils/timeline-util';
  import { reactionEmoji } from '$lib/utils/reaction-emoji';
  import { ReactionType, type AssetResponseDto } from '@immich/sdk';
  import { Text } from '@immich/ui';
  import { DateTime } from 'luxon';

  type Props = {
    asset: AssetResponseDto;
  };

  const { asset }: Props = $props();

  const {
    slideshowShowMetadataOverlay,
    slideshowShowDescription,
    slideshowShowReactions,
    slideshowMetadataOverlayMode,
  } = slideshowStore;

  const opacity = 0.7;

  const description = $derived(asset.exifInfo?.description?.trim() || '');

  const dateTime = $derived(
    asset.exifInfo?.timeZone && asset.exifInfo.dateTimeOriginal
      ? fromISODateTime(asset.exifInfo.dateTimeOriginal, asset.exifInfo.timeZone)
      : fromISODateTimeUTC(asset.localDateTime),
  );
  const dateString = $derived(dateTime.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY));

  const locationString = $derived(
    [asset.exifInfo?.city, asset.exifInfo?.state, asset.exifInfo?.country].filter(Boolean).join(', '),
  );

  const reactionCounts = $derived(
    activityManager.activities
      .filter(({ type, parentActivityId }) => type === ReactionType.Like && !parentActivityId)
      .reduce<Record<string, number>>((counts, { reactionKey }) => {
        const key = reactionKey ?? 'like';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
  );
  const hasReactions = $derived(Object.keys(reactionCounts).length > 0);

  const shouldShow = $derived.by(() => {
    if (!$slideshowShowMetadataOverlay) {
      return false;
    }
    if ($slideshowMetadataOverlayMode === SlideshowMetadataOverlayMode.DescriptionOnly) {
      return ($slideshowShowDescription && !!description) || ($slideshowShowReactions && hasReactions);
    }
    return (
      ($slideshowShowDescription && !!description) ||
      ($slideshowShowReactions && hasReactions) ||
      !!dateString ||
      !!locationString
    );
  });
</script>

{#if shouldShow}
  <div class="absolute inset-x-0 bottom-0 z-10">
    <div
      class="w-full px-6 py-4"
      style="background: linear-gradient(to top, rgba(0, 0, 0, {opacity}) 0%, rgba(0, 0, 0, {opacity * 0.8}) 100%);"
    >
      <div class="flex flex-col gap-2 text-white">
        {#if $slideshowShowReactions && hasReactions}
          <div class="flex flex-wrap items-center gap-1" aria-label="Reactions">
            {#each Object.entries(reactionCounts) as [key, count] (key)}
              <span
                class="rounded-full bg-black/30 px-1.5 py-0.5 text-xs"
                title={`${count} ${key} reaction${count === 1 ? '' : 's'}`}
              >
                <span class="text-sm">{reactionEmoji[key] ?? '😀'}</span>
                {count}
              </span>
            {/each}
          </div>
        {/if}
        {#if $slideshowShowDescription && description}
          <Text fontWeight="medium" class="line-clamp-3 leading-relaxed wrap-break-word whitespace-pre-wrap"
            >{description}</Text
          >
        {/if}
        {#if $slideshowMetadataOverlayMode !== SlideshowMetadataOverlayMode.DescriptionOnly}
          <div class="flex flex-col gap-1 text-sm opacity-90">
            {#if dateString}
              <Text>{dateString}</Text>
            {/if}
            {#if locationString}
              <Text>{locationString}</Text>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
