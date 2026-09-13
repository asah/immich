<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { shortcut } from '$lib/actions/shortcut';
  import AlbumMap from '$lib/components/album-page/AlbumMap.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { handleDownloadAlbum } from '$lib/services/album.service';
  import { Route } from '$lib/route';
  import { getGlobalActions } from '$lib/services/app.service';
  import { openSlideshowAtAsset } from '$lib/services/slideshow.service';
  import { dragAndDropFilesStore } from '$lib/stores/drag-and-drop-files.store';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { SlideshowNavigation, slideshowStore } from '$lib/stores/slideshow.store';
  import { getAlbumPresentationSettings } from '$lib/utils/album-presentation';
  import { sanitizeRichText } from '$lib/utils/sanitize-rich-text';
  import { handlePromiseError } from '$lib/utils';
  import { fileUploadHandler, openFileUploadDialog } from '$lib/utils/file-uploader';
  import {
    AlbumUserRole,
    AssetOrder,
    type AlbumResponseDto,
    type AssetResponseDto,
    type SharedLinkResponseDto,
  } from '@immich/sdk';
  import { ActionButton, IconButton, Logo } from '@immich/ui';
  import { mdiDownload, mdiFileImagePlusOutline, mdiPresentationPlay, mdiSort } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import ControlAppBar from '../shared-components/ControlAppBar.svelte';
  import ThemeButton from '../shared-components/ThemeButton.svelte';
  import AlbumSummary from './AlbumSummary.svelte';
  import { AlbumAssetSortBy, SortOrder, defaultAlbumAssetDisplayInfo } from '$lib/stores/preferences.store';
  import type { Viewport } from '$lib/managers/timeline-manager/types';
  import { DateTime } from 'luxon';
  import { toTimelineAsset } from '$lib/utils/timeline-util';

  interface Props {
    sharedLink: SharedLinkResponseDto;
  }

  let { sharedLink }: Props = $props();

  const album = sharedLink.album as AlbumResponseDto;
  const canEditAlbum = $derived(
    authManager.authenticated &&
      album.albumUsers.some(({ user, role }) => user.id === authManager.user.id && role !== AlbumUserRole.Viewer),
  );
  const presentationSettings = $derived(getAlbumPresentationSettings(album.presentation));

  let { slideshowNavigation } = slideshowStore;

  const galleryViewport: Viewport = $state({ width: 0, height: 0 });
  let galleryScrollTop = $state(0);
  let galleryElement = $state<HTMLElement>();

  const sortOverride = $derived.by<{ sortBy: AlbumAssetSortBy; sortOrder: SortOrder } | undefined>(() => {
    const sortBy = page.url.searchParams.get('sortBy') as AlbumAssetSortBy | null;
    const sortOrder = page.url.searchParams.get('sortOrder') as SortOrder | null;
    if (
      !sortBy ||
      !sortOrder ||
      !Object.values(AlbumAssetSortBy).includes(sortBy) ||
      !Object.values(SortOrder).includes(sortOrder)
    ) {
      return undefined;
    }
    return { sortBy, sortOrder };
  });
  const sortCriteria = $derived(
    sortOverride
      ? [sortOverride]
      : presentationSettings.sortCriteria?.length
        ? presentationSettings.sortCriteria
        : [
            {
              sortBy: AlbumAssetSortBy.DateTaken,
              sortOrder: album.order === AssetOrder.Asc ? SortOrder.Asc : SortOrder.Desc,
            },
          ],
  );
  const assetLabel = (asset: AssetResponseDto, sortBy: AlbumAssetSortBy): string | number => {
    const exif = asset.exifInfo;
    switch (sortBy) {
      case AlbumAssetSortBy.FileName:
        return asset.originalFileName;
      case AlbumAssetSortBy.FileSize:
        return exif?.fileSizeInByte ?? -1;
      case AlbumAssetSortBy.Tag:
        return asset.tags?.[0]?.name ?? 'Untagged';
      case AlbumAssetSortBy.Camera:
        return [exif?.make, exif?.model].filter(Boolean).join(' ') || 'Unknown camera';
      case AlbumAssetSortBy.Lens:
        return exif?.lensModel ?? 'Unknown lens';
      case AlbumAssetSortBy.Location:
        return [exif?.city, exif?.state, exif?.country].filter(Boolean).join(', ') || 'Unknown location';
      case AlbumAssetSortBy.Time:
        return DateTime.fromISO(asset.localDateTime, { zone: 'utc' }).hour;
      case AlbumAssetSortBy.Description:
        return exif?.description ?? '';
      case AlbumAssetSortBy.CameraSettings:
        return [
          exif?.focalLength && `${exif.focalLength}mm`,
          exif?.fNumber && `f/${exif.fNumber}`,
          exif?.iso && `ISO ${exif.iso}`,
        ]
          .filter(Boolean)
          .join(' ');
      case AlbumAssetSortBy.LensSettings:
        return [exif?.focalLength && `${exif.focalLength}mm`, exif?.fNumber && `f/${exif.fNumber}`]
          .filter(Boolean)
          .join(' ');
      case AlbumAssetSortBy.Engagement:
        return 0;
      case AlbumAssetSortBy.DateTaken:
      default:
        return asset.localDateTime;
    }
  };
  const galleryAssets = $derived.by(() => {
    const assets = [...(sharedLink.assets as AssetResponseDto[])];
    assets.sort((left, right) => {
      for (const { sortBy, sortOrder } of sortCriteria) {
        const a = assetLabel(left, sortBy);
        const b = assetLabel(right, sortBy);
        const comparison =
          typeof a === 'number' && typeof b === 'number'
            ? a - b
            : String(a) === String(b)
              ? 0
              : String(a) < String(b)
                ? -1
                : 1;
        if (comparison) return (sortOrder === SortOrder.Desc ? -1 : 1) * comparison;
      }
      return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
    });
    return assets;
  });
  const galleryGroupKeys = $derived.by(() => {
    if (!presentationSettings.showSortDividers) return undefined;
    const sortBy = sortCriteria[0]?.sortBy ?? AlbumAssetSortBy.DateTaken;
    return galleryAssets.map((asset) => String(assetLabel(asset, sortBy)));
  });

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
        ? galleryAssets[Math.floor(Math.random() * galleryAssets.length)]
        : galleryAssets[0];
    if (!asset) {
      return;
    }

    await openSlideshowAtAsset(asset.id);
  };

  const setSortOverride = async (sortBy?: AlbumAssetSortBy, sortOrder: SortOrder = SortOrder.Desc) => {
    const url = new URL(page.url);
    if (sortBy) {
      url.searchParams.set('sortBy', sortBy);
      url.searchParams.set('sortOrder', sortOrder);
    } else {
      url.searchParams.delete('sortBy');
      url.searchParams.delete('sortOrder');
    }
    await goto(url, { keepFocus: true, noScroll: true });
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
  class:dark={presentationSettings.instantCameraStyle}
>
  <div class:instant-camera={presentationSettings.instantCameraStyle} class="h-full">
    <section
      class="h-full overflow-y-auto"
      bind:clientHeight={galleryViewport.height}
      bind:clientWidth={galleryViewport.width}
      onscroll={(event) => (galleryScrollTop = event.currentTarget.scrollTop)}
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
          <div
            class="album-description mt-6 mb-12 w-full pb-2 text-start text-base font-medium text-black dark:text-gray-300"
          >
            {@html sanitizeRichText(album.description)}
          </div>
        {/if}
      </section>
      <div
        bind:this={galleryElement}
        class:mt-8={!presentationSettings.instantCameraStyle}
        class:bg-black={presentationSettings.instantCameraStyle}
      >
        <GalleryViewer
          assets={galleryAssets}
          assetInteraction={assetMultiSelectManager}
          disableAssetSelect={!sharedLink.allowDownload}
          {album}
          viewport={galleryViewport}
          viewportScrollTop={galleryScrollTop}
          slidingWindowOffset={galleryElement?.offsetTop ?? 0}
          rowHeight={presentationSettings.rowHeight}
          displayAssetInfo={{ ...defaultAlbumAssetDisplayInfo, ...presentationSettings.displayInfo }}
          primarySortGroupKeys={galleryGroupKeys}
          primarySortGroupDescriptions={galleryGroupKeys ? {} : undefined}
          captionsBelow={true}
          instantCameraStyle={presentationSettings.instantCameraStyle}
        />
      </div>
    </section>
  </div>
</main>

<header class:dark={presentationSettings.instantCameraStyle}>
  {#if assetMultiSelectManager.selectionActive}
    <AssetSelectControlBar>
      <button
        type="button"
        class="rounded px-3 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        onclick={() => assetMultiSelectManager.selectAssets(galleryAssets.map(toTimelineAsset))}>Select all</button
      >
      {#if sharedLink.allowDownload}
        <DownloadAction filename={album.albumName} />
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

        {#if canEditAlbum}
          <a
            class="rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            href={Route.viewAlbum({ id: album.id })}>{$t('edit_album')}</a
          >
        {/if}

        {#if album.assetCount > 0}
          <ButtonContextMenu icon={mdiSort} title="Sort" color="secondary" offset={{ x: 175, y: 25 }}>
            <MenuOption
              text="Album default"
              subtitle="Use the owner’s published sections and ordering"
              onClick={() => setSortOverride()}
            />
            <MenuOption
              text="Date & time — newest first"
              onClick={() => setSortOverride(AlbumAssetSortBy.DateTaken, SortOrder.Desc)}
            />
            <MenuOption
              text="Date & time — oldest first"
              onClick={() => setSortOverride(AlbumAssetSortBy.DateTaken, SortOrder.Asc)}
            />
            <MenuOption
              text="Filename — A to Z"
              onClick={() => setSortOverride(AlbumAssetSortBy.FileName, SortOrder.Asc)}
            />
            <MenuOption
              text="Filename — Z to A"
              onClick={() => setSortOverride(AlbumAssetSortBy.FileName, SortOrder.Desc)}
            />
            <MenuOption
              text="Description — A to Z"
              onClick={() => setSortOverride(AlbumAssetSortBy.Description, SortOrder.Asc)}
            />
            <MenuOption
              text="Location — A to Z"
              onClick={() => setSortOverride(AlbumAssetSortBy.Location, SortOrder.Asc)}
            />
            <MenuOption
              text="Camera — A to Z"
              onClick={() => setSortOverride(AlbumAssetSortBy.Camera, SortOrder.Asc)}
            />
            <MenuOption text="Lens — A to Z" onClick={() => setSortOverride(AlbumAssetSortBy.Lens, SortOrder.Asc)} />
            <MenuOption
              text="File size — largest first"
              onClick={() => setSortOverride(AlbumAssetSortBy.FileSize, SortOrder.Desc)}
            />
          </ButtonContextMenu>
        {/if}

        {#if album.voting?.enabled}
          <a
            class="rounded-full px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            href={`/share/${sharedLink.key}/vote`}>Vote</a
          >
        {/if}

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

  .album-description :global(p),
  .album-description :global(div) {
    margin-block: 0.5rem;
  }

  .album-description :global(a) {
    color: var(--color-immich-primary);
    text-decoration: underline;
  }
</style>
