<script lang="ts">
  import AssetLayout from '$lib/components/timeline/AssetLayout.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { TimelineDay } from '$lib/managers/timeline-manager/timeline-day.svelte';
  import type { TimelineMonth } from '$lib/managers/timeline-manager/timeline-month.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { assetsSnapshot, filterIsInOrNearViewport } from '$lib/managers/timeline-manager/utils.svelte';
  import type { VirtualScrollManager } from '$lib/managers/VirtualScrollManager/VirtualScrollManager.svelte';
  import { uploadAssetsStore } from '$lib/stores/upload';
  import { copyToClipboard } from '$lib/utils';
  import type { CommonPosition } from '$lib/utils/layout-utils';
  import { fromTimelinePlainDate, getDateLocaleString } from '$lib/utils/timeline-util';
  import { Icon } from '@immich/ui';
  import { mdiCheckCircle, mdiCircleOutline, mdiLink } from '@mdi/js';
  import type { Snippet } from 'svelte';

  type Props = {
    thumbnail: Snippet<
      [
        {
          asset: TimelineAsset;
          position: CommonPosition;
          timelineDay: TimelineDay;
          groupIndex: number;
        },
      ]
    >;
    customThumbnailLayout?: Snippet<[TimelineAsset]>;
    singleSelect: boolean;
    assetInteraction: AssetMultiSelectManager;
    timelineMonth: TimelineMonth;
    manager: VirtualScrollManager;
    onTimelineDaySelect: (timelineDay: TimelineDay, assets: TimelineAsset[]) => void;
    sectionLink?: (timelineDay: TimelineDay) => string | undefined;
  };
  let {
    thumbnail: thumbnailWithGroup,
    customThumbnailLayout,
    singleSelect,
    assetInteraction,
    timelineMonth,
    manager,
    onTimelineDaySelect,
    sectionLink,
  }: Props = $props();

  let { isUploading } = uploadAssetsStore;
  let hoveredTimelineDay = $state<string | null>(null);

  const transitionDuration = $derived(timelineMonth.timelineManager.suspendTransitions && !$isUploading ? 0 : 150);

  const getTimelineDayFullDate = (timelineDay: TimelineDay): string => {
    const { month, year } = timelineDay.timelineMonth.yearMonth;
    const date = fromTimelinePlainDate({
      year,
      month,
      day: timelineDay.day,
    });
    return getDateLocaleString(date);
  };

  const getSectionHref = (timelineDay: TimelineDay) => sectionLink?.(timelineDay);
  const copySectionLink = (href: string) => void copyToClipboard(new URL(href, window.location.href).toString());
</script>

{#each filterIsInOrNearViewport(timelineMonth.timelineDays) as timelineDay, groupIndex (timelineDay.day)}
  {@const isTimelineDaySelected = assetInteraction.selectedGroup.has(timelineDay.groupTitle)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <section
    class={[
      { 'transition-all': !timelineMonth.timelineManager.suspendTransitions },
      !timelineMonth.timelineManager.suspendTransitions && `delay-${transitionDuration}`,
    ]}
    data-group
    style:position="absolute"
    style:inset-inline-start={timelineDay.start + 'px'}
    style:top={timelineDay.top + 'px'}
    onmouseenter={() => (hoveredTimelineDay = timelineDay.groupTitle)}
    onmouseleave={() => (hoveredTimelineDay = null)}
  >
    <!-- Day title -->
    <div
      class="flex h-10 place-items-center pt-7 pb-5 font-sans text-xl font-semibold text-immich-fg max-md:pt-5 max-md:pb-3 md:text-2xl dark:text-immich-dark-fg"
      style:width={timelineDay.width + 'px'}
    >
      {#if !singleSelect}
        <div
          class="w-0 overflow-hidden transition-all duration-200 ease-out hover:cursor-pointer"
          class:w-8={hoveredTimelineDay === timelineDay.groupTitle ||
            assetInteraction.selectedGroup.has(timelineDay.groupTitle)}
          onclick={() => onTimelineDaySelect(timelineDay, assetsSnapshot(timelineDay.getAssets()))}
          onkeydown={() => onTimelineDaySelect(timelineDay, assetsSnapshot(timelineDay.getAssets()))}
        >
          {#if isTimelineDaySelected}
            <Icon icon={mdiCheckCircle} size="24" class="text-primary" />
          {:else}
            <Icon icon={mdiCircleOutline} size="24" class="text-light-500" />
          {/if}
        </div>
      {/if}

      {#if getSectionHref(timelineDay)}
        <a
          class="truncate first-letter:capitalize hover:text-primary hover:underline"
          href={getSectionHref(timelineDay)}
          title={getTimelineDayFullDate(timelineDay)}
        >
          {timelineDay.groupTitle}
        </a>
        <button
          class="ms-1 shrink-0 hover:text-primary"
          type="button"
          aria-label={timelineDay.groupTitle}
          onclick={() => copySectionLink(getSectionHref(timelineDay)!)}
        >
          <Icon icon={mdiLink} size="16" />
        </button>
      {:else}
        <span class="w-full truncate first-letter:capitalize" title={getTimelineDayFullDate(timelineDay)}>
          {timelineDay.groupTitle}
        </span>
      {/if}
    </div>

    <AssetLayout
      {manager}
      viewerAssets={timelineDay.activeViewerAssets}
      height={timelineDay.height}
      width={timelineDay.width}
      {customThumbnailLayout}
    >
      {#snippet thumbnail({ asset, position })}
        {@render thumbnailWithGroup({ asset, position, timelineDay, groupIndex })}
      {/snippet}
    </AssetLayout>
  </section>
{/each}

<style>
  section {
    contain: layout paint style;
  }
</style>
