<script lang="ts">
  import { goto, invalidate, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import AlbumMap from '$lib/components/album-page/AlbumMap.svelte';
  import AssetEngagementBadge from '$lib/components/album-page/AssetEngagementBadge.svelte';
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
  import { openSlideshowAtAsset } from '$lib/services/slideshow.service';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { SlideshowNavigation, slideshowStore } from '$lib/stores/slideshow.store';
  import {
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
    mdiUpload,
  } from '@mdi/js';
  import { onDestroy, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import { DateTime } from 'luxon';
  import type { PageData } from './$types';
  import AlbumDescription from './AlbumDescription.svelte';
  import AlbumTitle from './AlbumTitle.svelte';

  interface Props {
    data: PageData;
  }

  let { data = $bindable() }: Props = $props();
  let { slideshowNavigation } = slideshowStore;
  let oldAt: AssetGridRouteSearchParams | null | undefined = $state();
  let viewMode: AlbumPageViewMode = $state(AlbumPageViewMode.VIEW);
  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const filenameViewport: Viewport = $state({ width: 0, height: 0 });
  let filenameScrollTop = $state(0);
  let filenameGalleryElement: HTMLElement | undefined = $state();
  let filenameAssets: AssetResponseDto[] = $state([]);
  let filenameNextPage = $state<number | null>(null);
  let filenameLoading = $state(false);
  let showAlbumOptions = $state(false);
  let albumOptionsReadOnly = $state(false);
  let filenameRequest = 0;
  let availableTags: TagResponseDto[] = $state([]);
  let engagementFilter: string | 'comments' | undefined = $state();
  let showAlbumUsers = $derived(timelineManager?.showAssetOwners ?? false);

  const timelineMultiSelectManager = new AssetMultiSelectManager();

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
    if (!asset) {
      return;
    }

    await openSlideshowAtAsset(asset.id);
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
      album = response;
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
  const localDateTime = (asset: AssetResponseDto) => DateTime.fromISO(asset.localDateTime, { zone: 'utc' });
  const locationLabel = (asset: AssetResponseDto) => {
    const exif = asset.exifInfo;
    return [exif?.city, exif?.state, exif?.country].filter(Boolean).join(', ') || 'Unknown location';
  };
  const cameraLabel = (asset: AssetResponseDto) =>
    [asset.exifInfo?.make, asset.exifInfo?.model].filter(Boolean).join(' ') || 'Unknown camera';
  const cameraSettingsLabel = (asset: AssetResponseDto) => {
    const exif = asset.exifInfo;
    return (
      [
        exif?.focalLength && `${exif.focalLength}mm`,
        exif?.fNumber && `f/${exif.fNumber}`,
        exif?.iso && `ISO ${exif.iso}`,
      ]
        .filter(Boolean)
        .join(' ') || 'Unknown camera settings'
    );
  };
  const lensSettingsLabel = (asset: AssetResponseDto) => {
    const exif = asset.exifInfo;
    return (
      [exif?.focalLength && `${exif.focalLength}mm`, exif?.fNumber && `f/${exif.fNumber}`].filter(Boolean).join(' ') ||
      'Unknown lens settings'
    );
  };
  const fileSizeGroup = (asset: AssetResponseDto) => {
    const size = asset.exifInfo?.fileSizeInByte ?? 0;
    if (size < 1_000_000) return 'Under 1 MB';
    if (size < 5_000_000) return '1–5 MB';
    if (size < 20_000_000) return '5–20 MB';
    if (size < 100_000_000) return '20–100 MB';
    if (size < 500_000_000) return '100–500 MB';
    return '500 MB and over';
  };
  const sortCriteria = $derived.by(() => {
    const criteria = $albumAssetViewSettings.sortCriteria?.length
      ? $albumAssetViewSettings.sortCriteria
      : [{ sortBy: $albumAssetViewSettings.sortBy, sortOrder: $albumAssetViewSettings.sortOrder }];
    return criteria.length === 1 && criteria[0].sortBy === AlbumAssetSortBy.DateTaken
      ? [{ ...criteria[0], sortOrder: album.order === AssetOrder.Asc ? SortOrder.Asc : SortOrder.Desc }]
      : criteria;
  });
  const engagementByAsset = $derived.by(() => {
    const engagement: Record<string, { reactions: Record<string, number>; comments: number }> = {};
    for (const activity of activityManager.activities) {
      if (!activity.assetId || activity.parentActivityId) continue;
      const entry = (engagement[activity.assetId] ??= { reactions: {}, comments: 0 });
      if (activity.type === 'like') {
        const key = activity.reactionKey ?? 'like';
        entry.reactions[key] = (entry.reactions[key] ?? 0) + 1;
      } else if (activity.type === 'comment') {
        entry.comments++;
      }
    }
    return engagement;
  });
  const filteredFilenameAssets = $derived(
    !engagementFilter
      ? filenameAssets
      : filenameAssets.filter((asset) => {
          const engagement = engagementByAsset[asset.id];
          return engagementFilter === 'comments'
            ? (engagement?.comments ?? 0) > 0
            : (engagement?.reactions[engagementFilter as string] ?? 0) > 0;
        }),
  );
  const hasClientSort = $derived(
    sortCriteria.some(({ sortBy }) =>
      [
        AlbumAssetSortBy.Tag,
        AlbumAssetSortBy.Engagement,
        AlbumAssetSortBy.Camera,
        AlbumAssetSortBy.Location,
        AlbumAssetSortBy.Time,
        AlbumAssetSortBy.Description,
        AlbumAssetSortBy.CameraSettings,
        AlbumAssetSortBy.LensSettings,
      ].includes(sortBy),
    ),
  );
  const compareAssets = (left: AssetResponseDto, right: AssetResponseDto) => {
    for (const { sortBy, sortOrder } of sortCriteria) {
      const direction = sortOrder === SortOrder.Desc ? -1 : 1;
      let comparison = 0;
      if (sortBy === AlbumAssetSortBy.Engagement) {
        const score = (asset: AssetResponseDto) => {
          const engagement = engagementByAsset[asset.id];
          return (
            (engagement?.comments ?? 0) +
            Object.values(engagement?.reactions ?? {}).reduce((sum, count) => sum + count, 0)
          );
        };
        comparison = score(left) - score(right);
      } else {
        const value = (asset: AssetResponseDto): string | number => {
          const exif = asset.exifInfo;
          switch (sortBy) {
            case AlbumAssetSortBy.DateTaken:
              return asset.localDateTime;
            case AlbumAssetSortBy.FileName:
              return asset.originalFileName;
            case AlbumAssetSortBy.FileSize:
              return exif?.fileSizeInByte ?? -1;
            case AlbumAssetSortBy.Tag:
              return asset.tags?.[0]?.name ?? 'Untagged';
            case AlbumAssetSortBy.Camera:
              return cameraLabel(asset);
            case AlbumAssetSortBy.Lens:
              return exif?.lensModel ?? 'Unknown lens';
            case AlbumAssetSortBy.Location:
              return locationLabel(asset);
            case AlbumAssetSortBy.Time:
              return localDateTime(asset).hour;
            case AlbumAssetSortBy.Description:
              return exif?.description ?? '';
            case AlbumAssetSortBy.CameraSettings:
              return cameraSettingsLabel(asset);
            case AlbumAssetSortBy.LensSettings:
              return lensSettingsLabel(asset);
          }
        };
        const a = value(left);
        const b = value(right);
        comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      }
      if (comparison !== 0) return direction * comparison;
    }
    return left.id.localeCompare(right.id);
  };
  let isAlternateSort = $derived(
    viewMode === AlbumPageViewMode.VIEW &&
      (sortCriteria.length > 1 ||
        sortCriteria[0].sortBy !== AlbumAssetSortBy.DateTaken ||
        !!engagementFilter ||
        $albumAssetViewSettings.showSortDividers ||
        Object.values({ ...defaultAlbumAssetDisplayInfo, ...$albumAssetViewSettings.displayInfo }).some(Boolean)),
  );

  const primarySortGroupKeys = $derived.by(() => {
    if (!$albumAssetViewSettings.showSortDividers) {
      return undefined;
    }

    switch (sortCriteria[0].sortBy) {
      case AlbumAssetSortBy.DateTaken: {
        return filenameAssets.map((asset) => localDateTime(asset).toLocaleString(DateTime.DATE_MED));
      }
      case AlbumAssetSortBy.FileName: {
        return filenameAssets.map(({ originalFileName }) => originalFileName);
      }
      case AlbumAssetSortBy.FileSize: {
        return filenameAssets.map(fileSizeGroup);
      }
      case AlbumAssetSortBy.Camera: {
        return filenameAssets.map(cameraLabel);
      }
      case AlbumAssetSortBy.Lens: {
        return filenameAssets.map(({ exifInfo }) => exifInfo?.lensModel ?? 'Unknown lens');
      }
      case AlbumAssetSortBy.Location: {
        return filenameAssets.map(locationLabel);
      }
      case AlbumAssetSortBy.Time: {
        return filenameAssets.map((asset) => localDateTime(asset).toFormat('h a'));
      }
      case AlbumAssetSortBy.Description: {
        return filenameAssets.map(({ exifInfo }) => exifInfo?.description || 'No description');
      }
      case AlbumAssetSortBy.CameraSettings: {
        return filenameAssets.map(cameraSettingsLabel);
      }
      case AlbumAssetSortBy.LensSettings: {
        return filenameAssets.map(lensSettingsLabel);
      }
      case AlbumAssetSortBy.Engagement: {
        return filenameAssets.map((asset) => {
          const engagement = engagementByAsset[asset.id];
          return String(
            (engagement?.comments ?? 0) + Object.values(engagement?.reactions ?? {}).reduce((a, b) => a + b, 0),
          );
        });
      }
      case AlbumAssetSortBy.Tag: {
        return filenameAssets.map(({ tags }) => tags?.[0]?.name ?? 'Untagged');
      }
    }
  });

  const primarySortGroupDescriptions = $derived.by(() => {
    if (sortCriteria[0]?.sortBy === AlbumAssetSortBy.Tag) {
      return Object.fromEntries(availableTags.map((tag) => [tag.name, tag.description ?? null]));
    }
    // GalleryViewer renders visible section titles only when it receives this mapping.
    // An empty mapping gives all other primary groups their key as the title.
    return {} as Record<string, string | null | undefined>;
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
      const remoteSort = sortCriteria
        .filter(({ sortBy }) => sortBy !== AlbumAssetSortBy.Tag && sortBy !== AlbumAssetSortBy.Engagement)
        .map(({ sortBy, sortOrder }) => ({
          field:
            sortBy === AlbumAssetSortBy.FileSize
              ? Field.FileSizeInByte
              : sortBy === AlbumAssetSortBy.FileName
                ? Field.OriginalFileName
                : sortBy === AlbumAssetSortBy.Camera
                  ? Field.Model
                  : sortBy === AlbumAssetSortBy.Lens
                    ? Field.LensModel
                    : Field.FileCreatedAt,
          order: sortOrder === SortOrder.Asc ? AssetOrder.Asc : AssetOrder.Desc,
        }));
      const { assets } = await searchAssets({
        metadataSearchDto: {
          albumIds: [albumId],
          sort: remoteSort.length ? remoteSort : undefined,
          page: page ?? 1,
          size: 250,
          visibility: AssetVisibility.Timeline,
          withExif: true,
        },
      });
      if (request === filenameRequest) {
        const incoming = [...(reset ? [] : filenameAssets), ...assets.items];
        if (hasClientSort) incoming.sort(compareAssets);
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
    if ((engagementFilter || hasClientSort) && isAlternateSort && !filenameLoading && filenameNextPage) {
      untrack(() => void loadFilenameAssets());
    }
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

  const getAlbumSectionLink = (
    timelineDay: import('$lib/managers/timeline-manager/timeline-day.svelte').TimelineDay,
  ) => {
    const asset = timelineDay.getFirstAsset();
    return asset ? `${Route.viewAlbum({ id: album.id })}?at=${asset.id}` : undefined;
  };

  const onAssetsTag = async () => {
    if (isAlternateSort) {
      await Promise.all([loadFilenameAssets(true), getAllTags().then((tags) => (availableTags = tags))]);
      return;
    }

    await timelineManager?.reload();
  };

  $effect(() => {
    const assetId = page.url.searchParams.get('at');
    if (!isAlternateSort || !assetId || filenameAssets.length === 0 || !filenameGalleryElement) {
      return;
    }

    filenameGalleryElement
      .querySelector<HTMLElement>(`[data-section-anchor="${assetId}"]`)
      ?.scrollIntoView({ block: 'start' });
  });

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
  {onAssetsTag}
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
            albumThumbnailAssetId={album.albumThumbnailAssetId}
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
              assets={filteredFilenameAssets}
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
              rowHeight={$albumAssetViewSettings.rowHeight}
            >
              {#snippet assetOverlay(asset)}
                {@const engagement = engagementByAsset[asset.id] ?? { reactions: {}, comments: 0 }}
                {#if $albumAssetViewSettings.displayInfo?.reactions ?? true}
                  <AssetEngagementBadge reactions={engagement.reactions} comments={engagement.comments} />
                {/if}
              {/snippet}
            </GalleryViewer>
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
          sectionLink={getAlbumSectionLink}
          onEscape={handleEscape}
          withStacked={true}
          rowHeight={$albumAssetViewSettings.rowHeight}
        >
          {#snippet customThumbnailLayout(asset)}
            {@const engagement = engagementByAsset[asset.id] ?? { reactions: {}, comments: 0 }}
            {#if $albumAssetViewSettings.displayInfo?.reactions ?? true}
              <AssetEngagementBadge reactions={engagement.reactions} comments={engagement.comments} />
            {/if}
          {/snippet}
          {#if viewMode !== AlbumPageViewMode.SELECT_ASSETS}
            {#if viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL}
              <!-- ALBUM TITLE -->
              <section class="pt-8 md:pt-24">
                <AlbumTitle
                  id={album.id}
                  albumName={album.albumName}
                  albumThumbnailAssetId={album.albumThumbnailAssetId}
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
                      onclick={() => {
                        albumOptionsReadOnly = !isOwned;
                        showAlbumOptions = true;
                      }}
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
            allowAddingReactions={false}
            activeReactionKey={engagementFilter === 'comments' ? undefined : engagementFilter}
            activeComments={engagementFilter === 'comments'}
            onReaction={(key) => (engagementFilter = engagementFilter === key ? undefined : key)}
            onComments={() => (engagementFilter = engagementFilter === 'comments' ? undefined : 'comments')}
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
                aria-label={$t('select_from_computer')}
                onclick={() => Upload.onAction(Upload)}
                icon={mdiUpload}
              />
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
                    onClick={() => {
                      albumOptionsReadOnly = false;
                      showAlbumOptions = true;
                    }}
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
  {#if showAlbumOptions}
    <AlbumOptionsModal {album} readOnly={albumOptionsReadOnly} inline onClose={() => (showAlbumOptions = false)} />
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
