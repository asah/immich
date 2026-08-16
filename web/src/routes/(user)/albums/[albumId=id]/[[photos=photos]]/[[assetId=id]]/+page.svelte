<script lang="ts">
  import { goto, invalidate, onNavigate } from '$app/navigation';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import AlbumMap from '$lib/components/album-page/AlbumMap.svelte';
  import AlbumSummary from '$lib/components/album-page/AlbumSummary.svelte';
  import ActivityStatus from '$lib/components/asset-viewer/ActivityStatus.svelte';
  import ActivityViewer from '$lib/components/asset-viewer/ActivityViewer.svelte';
  import HeaderActionButton from '$lib/components/HeaderActionButton.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import ChangeLens from '$lib/components/timeline/actions/ChangeLensAction.svelte';
  import CreateSharedLink from '$lib/components/timeline/actions/CreateSharedLinkAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RemoveFromAlbum from '$lib/components/timeline/actions/RemoveFromAlbumAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import TagAction from '$lib/components/timeline/actions/TagAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AlbumPageViewMode } from '$lib/constants';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetMultiSelectManager, AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import AlbumOptionsModal from '$lib/modals/AlbumOptionsModal.svelte';
  import { Route } from '$lib/route';
  import {
    getAlbumActions,
    getAlbumAssetsActions,
    handleDeleteAlbum,
    handleDownloadAlbum,
  } from '$lib/services/album.service';
  import { getGlobalActions } from '$lib/services/app.service';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { SlideshowNavigation, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import {
    AlbumAssetImageBorder,
    AlbumAssetSortBy,
    albumAssetViewSettings,
    defaultAlbumAssetDisplayInfo,
    SortOrder,
  } from '$lib/stores/preferences.store';
  import { handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { isAlbumsRoute, navigate, type AssetGridRouteSearchParams } from '$lib/utils/navigation';
  import type { Viewport } from '$lib/managers/timeline-manager/types';
  import {
    AlbumUserRole,
    AssetOrder,
    AssetVisibility,
    Field,
    getAllTags,
    getAlbumInfo,
    searchAssets,
    updateAlbumInfo,
    type AlbumResponseDto,
    type AssetResponseDto,
    type TagResponseDto,
  } from '@immich/sdk';
  import {
    ActionButton,
    CommandPaletteDefaultProvider,
    Icon,
    IconButton,
    modalManager,
    toastManager,
  } from '@immich/ui';
  import {
    mdiAccountEye,
    mdiAccountEyeOutline,
    mdiArrowLeft,
    mdiCogOutline,
    mdiDeleteOutline,
    mdiDotsHorizontal,
    mdiDotsVertical,
    mdiDownload,
    mdiImageOutline,
    mdiImagePlusOutline,
    mdiLink,
    mdiPlus,
    mdiPresentationPlay,
  } from '@mdi/js';
  import { onDestroy, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import type { PageData } from './$types';
  import AlbumDescription from './AlbumDescription.svelte';
  import AlbumTitle from './AlbumTitle.svelte';

  interface Props {
    data: PageData;
  }

  let { data = $bindable() }: Props = $props();
  let { slideshowState, slideshowNavigation } = slideshowStore;
  let oldAt: AssetGridRouteSearchParams | null | undefined = $state();
  let viewMode: AlbumPageViewMode = $state(AlbumPageViewMode.VIEW);
  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const filenameViewport: Viewport = $state({ width: 0, height: 0 });
  let filenameScrollTop = $state(0);
  let filenameGalleryElement: HTMLElement | undefined = $state();
  let filenameAssets: AssetResponseDto[] = $state([]);
  let filenameNextPage = $state<number | null>(null);
  let filenameLoading = $state(false);
  let filenameRequest = 0;
  let availableTags: TagResponseDto[] = $state([]);
  let showAlbumUsers = $derived(timelineManager?.showAssetOwners ?? false);

  const timelineMultiSelectManager = new AssetMultiSelectManager();

  const albumImageBorderClass = $derived.by(() => {
    switch ($albumAssetViewSettings.imageBorder) {
      case AlbumAssetImageBorder.None:
        return '';
      case AlbumAssetImageBorder.Thin:
        return 'border-2 border-white';
      case AlbumAssetImageBorder.Thick:
      default:
        return 'border-4 border-white';
    }
  });

  const handleFavorite = async () => {
    try {
      await activityManager.toggleLike();
    } catch (error) {
      handleError(error, $t('errors.cant_change_asset_favorite'));
    }
  };

  const handleStartSlideshow = async () => {
    const asset =
      $slideshowNavigation === SlideshowNavigation.Shuffle
        ? await timelineManager.getRandomAsset()
        : (timelineManager.months[0]?.timelineDays[0]?.viewerAssets[0]?.asset ??
          (await timelineManager.getRandomAsset()));
    if (asset) {
      handlePromiseError(
        assetViewerManager.setAssetId(asset.id).then(() => ($slideshowState = SlideshowState.PlaySlideshow)),
      );
    }
  };

  const handleEscape = async () => {
    timelineManager.suspendTransitions = true;
    if (viewMode === AlbumPageViewMode.SELECT_THUMBNAIL) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      await handleCloseSelectAssets();
      return;
    }
    if (assetViewerManager.isViewing) {
      return;
    }
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
    await goto(Route.albums());
  };

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id });
  };

  const setModeToView = async () => {
    timelineManager.suspendTransitions = true;
    viewMode = AlbumPageViewMode.VIEW;
    await navigate(
      { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: oldAt?.at } },
      { replaceState: true, forceNavigate: true },
    );
    oldAt = null;
  };

  const handleCloseSelectAssets = async () => {
    timelineMultiSelectManager.clear();
    await setModeToView();
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  const handleFavoriteAssets = (assetIds: string[], isFavorite: boolean) => {
    timelineManager?.update(assetIds, (asset) => (asset.isFavorite = isFavorite));

    if (filenameAssets.length > 0) {
      filenameAssets = filenameAssets.map((asset) => (assetIds.includes(asset.id) ? { ...asset, isFavorite } : asset));
    }
  };

  const handleRemoveAssets = async (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    await refreshAlbum();
  };

  const handleUndoRemoveAssets = async (assets: TimelineAsset[]) => {
    timelineManager.upsertAssets(assets);
    await refreshAlbum();
  };

  const handleUpdateThumbnail = async (assetId: string) => {
    if (viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL) {
      return;
    }

    await updateThumbnail(assetId);

    viewMode = AlbumPageViewMode.VIEW;
    assetMultiSelectManager.clear();
  };

  const updateThumbnailUsingCurrentSelection = async () => {
    if (assetMultiSelectManager.assets.length !== 1) {
      return;
    }

    const [firstAsset] = assetMultiSelectManager.assets;
    assetMultiSelectManager.clear();
    await updateThumbnail(firstAsset.id);
  };

  const updateThumbnail = async (assetId: string) => {
    try {
      const response = await updateAlbumInfo({
        id: album.id,
        updateAlbumDto: {
          albumThumbnailAssetId: assetId,
        },
      });
      eventManager.emit('AlbumUpdate', response);
      toastManager.primary($t('album_cover_updated'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_album_cover'));
    }
  };

  onNavigate(async ({ to }) => {
    if (!isAlbumsRoute(to?.route.id) && album.assetCount === 0 && !album.albumName) {
      await handleDeleteAlbum(album, { notify: false, prompt: false });
    }
  });

  let album = $derived(data.album);
  let albumId = $derived(album.id);
  const sortCriteria = $derived.by(() => {
    const criteria = $albumAssetViewSettings.sortCriteria?.length
      ? $albumAssetViewSettings.sortCriteria
      : [{ sortBy: $albumAssetViewSettings.sortBy, sortOrder: $albumAssetViewSettings.sortOrder }];
    return criteria.length === 1 && criteria[0].sortBy === AlbumAssetSortBy.DateTaken
      ? [{ ...criteria[0], sortOrder: album.order === AssetOrder.Asc ? SortOrder.Asc : SortOrder.Desc }]
      : criteria;
  });
  let isAlternateSort = $derived(
    viewMode === AlbumPageViewMode.VIEW &&
      (sortCriteria.length > 1 ||
        sortCriteria[0].sortBy !== AlbumAssetSortBy.DateTaken ||
        $albumAssetViewSettings.showSortDividers ||
        Object.values({ ...defaultAlbumAssetDisplayInfo, ...$albumAssetViewSettings.displayInfo }).some(Boolean)),
  );

  const primarySortGroupKeys = $derived.by(() => {
    if (!$albumAssetViewSettings.showSortDividers) {
      return undefined;
    }

    switch (sortCriteria[0].sortBy) {
      case AlbumAssetSortBy.DateTaken: {
        return filenameAssets.map(({ fileCreatedAt }) => fileCreatedAt.slice(0, 10));
      }
      case AlbumAssetSortBy.FileName: {
        return filenameAssets.map(({ originalFileName }) => originalFileName);
      }
      case AlbumAssetSortBy.FileSize: {
        return filenameAssets.map(({ exifInfo }) => String(exifInfo?.fileSizeInByte ?? ''));
      }
      case AlbumAssetSortBy.Tag: {
        return filenameAssets.map(({ tags }) => tags?.[0]?.name ?? 'Untagged');
      }
    }
  });

  const primarySortGroupDescriptions = $derived.by(() => {
    if (sortCriteria[0]?.sortBy !== AlbumAssetSortBy.Tag) {
      return undefined;
    }
    return Object.fromEntries(availableTags.map((tag) => [tag.name, tag.description ?? null]));
  });

  const primarySortGroupColors = $derived.by(() => {
    if (sortCriteria[0]?.sortBy !== AlbumAssetSortBy.Tag) {
      return undefined;
    }
    return Object.fromEntries(availableTags.map((tag) => [tag.name, tag.color ?? null]));
  });

  const containsEditors = $derived(album?.shared && album.albumUsers.some(({ role }) => role === AlbumUserRole.Editor));
  const albumUsers = $derived(showAlbumUsers && containsEditors ? album.albumUsers.map(({ user }) => user) : []);

  const options = $derived.by(() => {
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      return {
        visibility: AssetVisibility.Timeline,
        withPartners: true,
        timelineAlbumId: albumId,
      };
    }
    return { albumId, order: album.order };
  });

  const isShared = $derived(viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : album.albumUsers.length > 0);

  $effect(() => {
    if (assetViewerManager.isViewing || !isShared) {
      return;
    }

    handlePromiseError(activityManager.init(album.id));
  });

  onDestroy(() => activityManager.reset());

  const isOwned = $derived(album.albumUsers[0].user.id === authManager.user.id);

  const loadFilenameAssets = async (reset = false) => {
    if ((!reset && filenameLoading) || (!reset && !filenameNextPage)) {
      return;
    }
    const request = reset ? ++filenameRequest : filenameRequest;
    filenameLoading = true;
    try {
      const page = reset ? 1 : filenameNextPage;
      const { assets } = await searchAssets({
        metadataSearchDto: {
          albumIds: [albumId],
          sort: sortCriteria
            .filter(({ sortBy }) => sortBy !== AlbumAssetSortBy.Tag)
            .map(({ sortBy, sortOrder }) => ({
              field:
                sortBy === AlbumAssetSortBy.FileSize
                  ? Field.FileSizeInByte
                  : sortBy === AlbumAssetSortBy.FileName
                    ? Field.OriginalFileName
                    : Field.FileCreatedAt,
              order: sortOrder === SortOrder.Asc ? AssetOrder.Asc : AssetOrder.Desc,
            })),
          page: page ?? 1,
          size: 250,
          visibility: AssetVisibility.Timeline,
          withExif: true,
        },
      });
      if (request === filenameRequest) {
        const incoming = [...(reset ? [] : filenameAssets), ...assets.items];
        if (sortCriteria[0]?.sortBy === AlbumAssetSortBy.Tag) {
          const direction = sortCriteria[0].sortOrder === SortOrder.Desc ? -1 : 1;
          incoming.sort(
            (a, b) =>
              direction *
              String(a.tags?.[0]?.name ?? 'Untagged').localeCompare(String(b.tags?.[0]?.name ?? 'Untagged')),
          );
        }
        filenameAssets = incoming;
        filenameNextPage = Number(assets.nextPage) || null;
      }
    } catch (error) {
      handleError(error, $t('loading_search_results_failed'));
    } finally {
      if (request === filenameRequest) {
        filenameLoading = false;
      }
    }
  };

  $effect(() => {
    void getAllTags().then((tags) => (availableTags = tags));
  });

  $effect(() => {
    const alternateSort = isAlternateSort;
    const sortBy = $albumAssetViewSettings.sortBy;
    const sortOrder = $albumAssetViewSettings.sortOrder;
    const criteria = sortCriteria;
    const albumOrder = album.order;
    const id = albumId;
    if (alternateSort && sortBy && sortOrder && criteria && albumOrder && id) {
      untrack(() => void loadFilenameAssets(true));
    }
  });

  let showActivityStatus = $derived(album.albumUsers.length > 0 && !assetViewerManager.isViewing);
  const isEditor = $derived(
    album.albumUsers.find(({ user: { id } }) => id === authManager.user.id)?.role === AlbumUserRole.Editor || isOwned,
  );

  let albumHasViewers = $derived(album.albumUsers.some(({ role }) => role === AlbumUserRole.Viewer));
  const isSelectionMode = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? true : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const singleSelect = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const showArchiveIcon = $derived(viewMode !== AlbumPageViewMode.SELECT_ASSETS);
  const onSelect = ({ id }: { id: string }) => {
    if (viewMode !== AlbumPageViewMode.SELECT_ASSETS) {
      void handleUpdateThumbnail(id);
    }
  };
  const currentAssetIntersection = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? timelineMultiSelectManager : assetMultiSelectManager,
  );

  const onSharedLinkCreate = async () => {
    await refreshAlbum();
  };

  const onAlbumDelete = async ({ id }: AlbumResponseDto) => {
    if (id !== album.id) {
      return;
    }

    await goto(Route.albums());
    viewMode = AlbumPageViewMode.VIEW;
  };

  const onAlbumAddAssets = async ({ albumIds }: { albumIds: string[] }) => {
    if (!albumIds.includes(album.id)) {
      return;
    }

    await refreshAlbum();
    timelineMultiSelectManager.clear();
    await setModeToView();
  };

  const onAlbumShare = async () => {
    await refreshAlbum();
    await setModeToView();
  };

  const onAlbumUserUpdate = ({ albumId, userId, role }: { albumId: string; userId: string; role: AlbumUserRole }) => {
    if (albumId !== album.id) {
      return;
    }

    const albumUsers = album.albumUsers.map((albumUser) =>
      albumUser.user.id === userId ? { ...albumUser, role } : albumUser,
    );
    album = { ...album, albumUsers };
  };

  const onAlbumUpdate = async (newAlbum: AlbumResponseDto) => {
    album = newAlbum;

    await invalidate('album:data');
  };

  const { Cast } = $derived(getGlobalActions($t));
  const { Share } = $derived(getAlbumActions($t, album));
  const { AddAssets, Upload } = $derived(getAlbumAssetsActions($t, album, timelineMultiSelectManager.assets));

  const Close = $derived({
    title: $t('go_back'),
    icon: mdiArrowLeft,
    onAction: handleEscape,
    $if: () => !assetViewerManager.isViewing,
    shortcuts: { key: 'Escape' },
  });
</script>

<OnEvents
  {onSharedLinkCreate}
  onSharedLinkDelete={refreshAlbum}
  {onAlbumDelete}
  {onAlbumAddAssets}
  {onAlbumShare}
  {onAlbumUserUpdate}
  onAlbumUserDelete={refreshAlbum}
  {onAlbumUpdate}
/>
<CommandPaletteDefaultProvider name={$t('album')} actions={[AddAssets, Upload, Close]} />

<div class="flex overflow-hidden" use:scrollMemoryClearer={{ routeStartsWith: Route.albums() }}>
  <div class="relative w-full shrink">
    <main class="relative h-dvh overflow-hidden px-2 pt-(--navbar-height) max-md:pt-(--navbar-height-md) md:px-6">
      {#if isAlternateSort}
        <section
          class="h-full overflow-y-auto pt-8 md:pt-8"
          bind:clientHeight={filenameViewport.height}
          bind:clientWidth={filenameViewport.width}
          onscroll={(event) => (filenameScrollTop = event.currentTarget.scrollTop)}
        >
          <AlbumTitle
            id={album.id}
            albumName={album.albumName}
            {isOwned}
            onUpdate={(albumName) => (album = { ...album, albumName })}
          />

          {#if album.assetCount > 0}
            <AlbumSummary {album} />
          {/if}

          <AlbumDescription
            id={album.id}
            {isOwned}
            bind:description={() => album.description, (description) => (album = { ...album, description })}
          />

          <div class="mt-8" bind:this={filenameGalleryElement}>
            <GalleryViewer
              assets={filenameAssets}
              assetInteraction={assetMultiSelectManager}
              onEndReached={() => loadFilenameAssets()}
              showArchiveIcon={true}
              displayAssetInfo={{ ...defaultAlbumAssetDisplayInfo, ...$albumAssetViewSettings.displayInfo }}
              {album}
              {primarySortGroupKeys}
              {primarySortGroupDescriptions}
              {primarySortGroupColors}
              slidingWindowOffset={filenameGalleryElement?.offsetTop ?? 0}
              viewportScrollTop={filenameScrollTop}
              viewport={filenameViewport}
              imageClass={albumImageBorderClass}
            />
          </div>
        </section>
      {:else}
        <Timeline
          enableRouting={viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : true}
          {album}
          {albumUsers}
          bind:timelineManager
          {options}
          assetInteraction={currentAssetIntersection}
          {isShared}
          {isSelectionMode}
          {singleSelect}
          {showArchiveIcon}
          {onSelect}
          onEscape={handleEscape}
          withStacked={true}
          imageClass={albumImageBorderClass}
        >
          {#if viewMode !== AlbumPageViewMode.SELECT_ASSETS}
            {#if viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL}
              <!-- ALBUM TITLE -->
              <section class="pt-8 md:pt-24">
                <AlbumTitle
                  id={album.id}
                  albumName={album.albumName}
                  {isOwned}
                  onUpdate={(albumName) => (album = { ...album, albumName })}
                />

                {#if album.assetCount > 0}
                  <AlbumSummary {album} />
                {/if}

                <!-- ALBUM SHARING -->
                {#if album.albumUsers.length > 1 || (album.hasSharedLink && isOwned)}
                  <div class="my-3 flex gap-x-1">
                    <button
                      class="flex gap-x-1"
                      type="button"
                      onclick={() => modalManager.show(AlbumOptionsModal, { album, readOnly: !isOwned })}
                    >
                      <!-- owner & users with write access (collaborators) -->
                      {#each album.albumUsers.filter(({ role }) => role === AlbumUserRole.Editor || role === AlbumUserRole.Owner) as { user } (user.id)}
                        <UserAvatar {user} size="md" />
                      {/each}

                      <!-- display ellipsis if there are readonly users too -->
                      {#if albumHasViewers}
                        <IconButton
                          shape="round"
                          aria-label={$t('view_all_users')}
                          color="secondary"
                          size="medium"
                          icon={mdiDotsHorizontal}
                        />
                      {/if}

                      {#if album.hasSharedLink && isOwned}
                        <IconButton
                          aria-label={$t('shared_link_manage_links')}
                          color="secondary"
                          size="medium"
                          shape="round"
                          icon={mdiLink}
                        />
                      {/if}
                    </button>

                    {#if isOwned}
                      <ActionButton action={Share} />
                    {/if}
                  </div>
                {/if}
                <AlbumDescription
                  id={album.id}
                  {isOwned}
                  bind:description={() => album.description, (description) => (album = { ...album, description })}
                />
              </section>
            {/if}

            {#if album.assetCount === 0}
              <section id="empty-album" class="mt-50 flex place-content-center place-items-center">
                <div class="w-75">
                  <p class="text-xs uppercase dark:text-immich-dark-fg">{$t('add_photos')}</p>
                  <button
                    type="button"
                    onclick={() => (viewMode = AlbumPageViewMode.SELECT_ASSETS)}
                    class="mt-5 flex w-full place-items-center gap-6 rounded-2xl border bg-subtle p-8 text-immich-fg transition-all hover:bg-gray-100 hover:text-immich-primary dark:border-none dark:text-immich-dark-fg dark:hover:bg-gray-500/20 dark:hover:text-immich-dark-primary"
                  >
                    <span class="text-primary">
                      <Icon icon={mdiPlus} size="24" />
                    </span>
                    <span class="text-lg">{$t('select_photos')}</span>
                  </button>
                </div>
              </section>
            {/if}
          {/if}
        </Timeline>
      {/if}

      {#if showActivityStatus}
        <div class="absolute inset-e-0 bottom-0 z-2 me-12 mb-6">
          <ActivityStatus
            disabled={false}
            isLiked={activityManager.isLiked}
            numberOfComments={activityManager.commentCount}
            numberOfLikes={undefined}
            onFavorite={handleFavorite}
            onReaction={(key) => activityManager.toggleLike(key)}
          />
        </div>
      {/if}
    </main>

    {#if assetMultiSelectManager.selectionActive}
      <AssetSelectControlBar>
        {@const Actions = getAssetBulkActions($t)}
        <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
        <CreateSharedLink />
        <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
        <ActionButton action={Actions.AddToAlbum} />
        {#if isEditor && availableTags.length > 0}<TagAction />{/if}
        {#if assetMultiSelectManager.isAllUserOwned}
          <FavoriteAction removeFavorite={assetMultiSelectManager.isAllFavorite} onFavorite={handleFavoriteAssets}
          ></FavoriteAction>
        {/if}
        <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')} offset={{ x: 175, y: 25 }}>
          <DownloadAction menuItem filename="{album.albumName}.zip" />
          {#if assetMultiSelectManager.isAllUserOwned}
            <ChangeDate menuItem />
            <ChangeDescription menuItem />
            <ChangeLocation menuItem />
            <ChangeLens menuItem />
            <ArchiveAction
              menuItem
              unarchive={assetMultiSelectManager.isAllArchived}
              onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
            />
            <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
          {/if}
          {#if assetMultiSelectManager.assets.length === 1}
            <MenuOption
              text={$t('set_as_album_cover')}
              icon={mdiImageOutline}
              onClick={() => updateThumbnailUsingCurrentSelection()}
            />
          {/if}

          {#if authManager.preferences.tags.enabled && assetMultiSelectManager.isAllUserOwned}
            <TagAction menuItem />
          {/if}

          {#if isOwned || assetMultiSelectManager.isAllUserOwned}
            <RemoveFromAlbum menuItem bind:album onRemove={handleRemoveAssets} />
          {/if}
          {#if assetMultiSelectManager.isAllUserOwned}
            <DeleteAssets menuItem onAssetDelete={handleRemoveAssets} onUndoDelete={handleUndoRemoveAssets} />
          {/if}
        </ButtonContextMenu>
      </AssetSelectControlBar>
    {:else}
      {#if viewMode === AlbumPageViewMode.VIEW}
        <ControlAppBar backIcon={mdiArrowLeft} onClose={() => goto(Route.albums())}>
          {#snippet trailing()}
            <ActionButton action={Cast} />

            {#if isEditor}
              <IconButton
                variant="ghost"
                shape="round"
                color="secondary"
                aria-label={$t('add_photos')}
                onclick={async () => {
                  timelineManager.suspendTransitions = true;
                  viewMode = AlbumPageViewMode.SELECT_ASSETS;
                  oldAt = { at: assetViewerManager.gridScrollTarget?.at };
                  await navigate(
                    { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: null } },
                    { replaceState: true },
                  );
                }}
                icon={mdiImagePlusOutline}
              />
            {/if}

            <ActionButton action={Share} />

            {#if featureFlagsManager.value.map}
              <AlbumMap {album} />
            {/if}

            {#if album.assetCount > 0}
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
                variant="ghost"
                color="secondary"
                aria-label={$t('download')}
                onclick={() => handleDownloadAlbum(album)}
                icon={mdiDownload}
              />
            {/if}

            {#if isOwned || containsEditors}
              <ButtonContextMenu
                icon={mdiDotsVertical}
                title={$t('album_options')}
                color="secondary"
                offset={{ x: 175, y: 25 }}
              >
                {#if containsEditors}
                  <MenuOption
                    icon={showAlbumUsers ? mdiAccountEye : mdiAccountEyeOutline}
                    text={$t('view_asset_owners')}
                    onClick={() => timelineManager.toggleShowAssetOwners()}
                  />
                {/if}
                {#if isOwned && album.assetCount > 0}
                  <MenuOption
                    icon={mdiImageOutline}
                    text={$t('select_album_cover')}
                    onClick={() => (viewMode = AlbumPageViewMode.SELECT_THUMBNAIL)}
                  />
                  <MenuOption
                    icon={mdiCogOutline}
                    text={$t('options')}
                    onClick={() => modalManager.show(AlbumOptionsModal, { album })}
                  />
                {/if}

                {#if isOwned}
                  <MenuOption
                    icon={mdiDeleteOutline}
                    text={$t('delete_album')}
                    onClick={() => handleDeleteAlbum(album)}
                  />
                {/if}
              </ButtonContextMenu>
            {/if}
          {/snippet}
        </ControlAppBar>
      {/if}

      {#if viewMode === AlbumPageViewMode.SELECT_ASSETS}
        <ControlAppBar onClose={handleCloseSelectAssets}>
          {#snippet leading()}
            <p class="text-lg dark:text-immich-dark-fg">
              {#if !timelineMultiSelectManager.selectionActive}
                {$t('add_to_album')}
              {:else}
                {$t('selected_count', { values: { count: timelineMultiSelectManager.assets.length } })}
              {/if}
            </p>
          {/snippet}

          {#snippet trailing()}
            <HeaderActionButton action={Upload} />
            <HeaderActionButton action={AddAssets} />
          {/snippet}
        </ControlAppBar>
      {/if}

      {#if viewMode === AlbumPageViewMode.SELECT_THUMBNAIL}
        <ControlAppBar onClose={() => (viewMode = AlbumPageViewMode.VIEW)}>
          {#snippet leading()}
            {$t('select_album_cover')}
          {/snippet}
        </ControlAppBar>
      {/if}
    {/if}
  </div>
  {#if album.albumUsers.length > 0 && album && assetViewerManager.isShowActivityPanel && authManager.authenticated && !assetViewerManager.isViewing}
    <div class="flex">
      <div
        transition:fly={{ duration: 150 }}
        id="activity-panel"
        class="z-2 w-90 overflow-y-auto transition-all md:w-115 dark:border-l dark:border-s-immich-dark-gray"
        translate="yes"
      >
        <ActivityViewer disabled={false} albumUsers={album.albumUsers} albumId={album.id} />
      </div>
    </div>
  {/if}
</div>

<style>
  ::placeholder {
    color: rgb(60, 60, 60);
    opacity: 0.6;
  }

  ::-ms-input-placeholder {
    /* Edge 12 -18 */
    color: white;
  }
</style>
