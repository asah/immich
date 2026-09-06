<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import AlbumMap from '$lib/components/album-page/AlbumMap.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { handleDownloadAlbum } from '$lib/services/album.service';
  import { getGlobalActions } from '$lib/services/app.service';
  import { openSlideshowAtAsset } from '$lib/services/slideshow.service';
  import { dragAndDropFilesStore } from '$lib/stores/drag-and-drop-files.store';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { SlideshowNavigation, slideshowStore } from '$lib/stores/slideshow.store';
  import { getAlbumPresentationSettings } from '$lib/utils/album-presentation';
  import { handlePromiseError } from '$lib/utils';
  import { fileUploadHandler, openFileUploadDialog } from '$lib/utils/file-uploader';
  import type { AlbumResponseDto, SharedLinkResponseDto } from '@immich/sdk';
  import { ActionButton, IconButton, Logo } from '@immich/ui';
  import { mdiDownload, mdiFileImagePlusOutline, mdiPresentationPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import ControlAppBar from '../shared-components/ControlAppBar.svelte';
  import ThemeButton from '../shared-components/ThemeButton.svelte';
  import AlbumSummary from './AlbumSummary.svelte';

  interface Props {
    sharedLink: SharedLinkResponseDto;
  }

  let { sharedLink }: Props = $props();

  const album = sharedLink.album as AlbumResponseDto;
  const presentationSettings = $derived(getAlbumPresentationSettings(album.presentation));

  let { slideshowNavigation } = slideshowStore;

  const options = $derived({ albumId: album.id, order: album.order });
  let timelineManager = $state<TimelineManager>() as TimelineManager;

  dragAndDropFilesStore.subscribe((value) => {
    if (!(value.isDragging && value.files.length > 0)) {
      return;
    }

    handlePromiseError(fileUploadHandler({ files: value.files, albumId: album.id }));
    dragAndDropFilesStore.set({ isDragging: false, files: [] });
  });

  const handleStartSlideshow = async () => {
    const asset =
      $slideshowNavigation === SlideshowNavigation.Shuffle
        ? await timelineManager.getRandomAsset()
        : (timelineManager.months[0]?.timelineDays[0]?.viewerAssets[0]?.asset ??
          (await timelineManager.getRandomAsset()));
    if (!asset) {
      return;
    }

    await openSlideshowAtAsset(asset.id);
  };

  const { Cast } = $derived(getGlobalActions($t));
</script>

<svelte:document
  use:shortcut={{
    shortcut: { key: 'Escape' },
    onShortcut: () => {
      if (!assetViewerManager.isViewing && assetMultiSelectManager.selectionActive) {
        assetMultiSelectManager.clear();
      }
    },
  }}
/>

<main
  class="relative h-dvh overflow-hidden px-2 pt-(--navbar-height) max-md:pt-(--navbar-height-md) md:px-6"
  class:bg-black={presentationSettings.instantCameraStyle}
>
  <div class:instant-camera={presentationSettings.instantCameraStyle} class="h-full">
    <Timeline
      enableRouting={true}
      {album}
      bind:timelineManager
      {options}
      assetInteraction={assetMultiSelectManager}
      rowHeight={presentationSettings.rowHeight}
      imageClass={presentationSettings.instantCameraStyle ? 'box-border border-4 border-white' : ''}
    >
      <section
        class={presentationSettings.instantCameraStyle
          ? '-mx-2 bg-white px-2 pt-8 pb-8 text-immich-fg dark:bg-immich-dark-bg dark:text-immich-dark-fg md:-mx-6 md:px-6'
          : 'px-2 pt-8 md:px-0 md:pt-24'}
      >
        <!-- ALBUM TITLE -->
        <h1 class="text-2xl text-primary transition-all outline-none md:text-4xl lg:text-6xl">
          {album.albumName}
        </h1>

        {#if album.assetCount > 0}
          <AlbumSummary {album} />
        {/if}

        <!-- ALBUM DESCRIPTION -->
        {#if album.description}
          <p
            class="mt-6 mb-12 w-full pb-2 text-start text-base font-medium whitespace-pre-line text-black dark:text-gray-300"
          >
            {album.description}
          </p>
        {/if}
      </section>
    </Timeline>
  </div>
</main>

<header>
  {#if assetMultiSelectManager.selectionActive}
    <AssetSelectControlBar>
      <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
      {#if sharedLink.allowDownload}
        <DownloadAction filename="{album.albumName}.zip" />
      {/if}
    </AssetSelectControlBar>
  {:else}
    <ControlAppBar>
      {#snippet leading()}
        <a data-sveltekit-preload-data="hover" class="ms-4" href="/">
          <Logo variant={mediaQueryManager.maxMd ? 'icon' : 'inline'} class="min-w-10" />
        </a>
      {/snippet}

      {#snippet trailing()}
        <ActionButton action={Cast} />

        {#if sharedLink.allowUpload}
          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            aria-label={$t('add_photos')}
            onclick={() => openFileUploadDialog({ albumId: album.id })}
            icon={mdiFileImagePlusOutline}
          />
        {/if}

        {#if album.assetCount > 0 && sharedLink.allowDownload}
          <IconButton
            shape="round"
            variant="ghost"
            color="secondary"
            aria-label={$t('slideshow')}
            onclick={handleStartSlideshow}
            icon={mdiPresentationPlay}
          />
          <IconButton
            shape="round"
            color="secondary"
            variant="ghost"
            aria-label={$t('download')}
            onclick={() => handleDownloadAlbum(album)}
            icon={mdiDownload}
          />
        {/if}
        {#if sharedLink.showMetadata && featureFlagsManager.value.map}
          <AlbumMap {album} />
        {/if}
        <ThemeButton />
      {/snippet}
    </ControlAppBar>
  {/if}
</header>

<style>
  .instant-camera :global([data-group] > div:first-child) {
    color: white;
  }
</style>
