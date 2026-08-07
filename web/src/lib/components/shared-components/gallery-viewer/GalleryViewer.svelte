<script lang="ts">
  import { goto } from '$app/navigation';
  import { shortcuts, type ShortcutOptions } from '$lib/actions/shortcut';
  import type { Action } from '$lib/components/asset-viewer/actions/action';
  import type { AssetCursor } from '$lib/components/asset-viewer/AssetViewer.svelte';
  import Thumbnail from '$lib/components/assets/thumbnail/Thumbnail.svelte';
  import GalleryAssetInfo from '$lib/components/shared-components/gallery-viewer/GalleryAssetInfo.svelte';
  import { AssetAction } from '$lib/constants';
  import Portal from '$lib/elements/Portal.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import type { TimelineAsset, Viewport } from '$lib/managers/timeline-manager/types';
  import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
  import ShortcutsModal from '$lib/modals/ShortcutsModal.svelte';
  import { Route } from '$lib/route';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';
  import { showDeleteModal } from '$lib/stores/preferences.store';
  import type { AlbumAssetDisplayInfo } from '$lib/stores/preferences.store';
  import { handlePromiseError } from '$lib/utils';
  import { deleteAssets } from '$lib/utils/actions';
  import { archiveAssets, getNextAsset, getPreviousAsset, navigateToAsset } from '$lib/utils/asset-utils';
  import { moveFocus } from '$lib/utils/focus-util';
  import { handleError } from '$lib/utils/handle-error';
  import { getGroupedJustifiedLayoutFromAssets, getJustifiedLayoutFromAssets } from '$lib/utils/layout-utils';
  import { navigate } from '$lib/utils/navigation';
  import { isTimelineAsset, toTimelineAsset } from '$lib/utils/timeline-util';
  import { TUNABLES } from '$lib/utils/tunables';
  import { AssetVisibility, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { modalManager } from '@immich/ui';
  import { debounce } from 'lodash-es';
  import { t } from 'svelte-i18n';

  const {
    TIMELINE: { INTERSECTION_EXPAND_TOP, INTERSECTION_EXPAND_BOTTOM },
  } = TUNABLES;

  type Props = {
    assets: AssetResponseDto[];
    viewerAssets?: AssetResponseDto[];
    assetInteraction: AssetMultiSelectManager;
    disableAssetSelect?: boolean;
    showArchiveIcon?: boolean;
    viewport: Viewport;
    onEndReached?: (() => void) | undefined;
    showAssetName?: boolean;
    displayAssetInfo?: AlbumAssetDisplayInfo;
    onReload?: (() => void) | undefined;
    pageHeaderOffset?: number;
    slidingWindowOffset?: number;
    arrowNavigation?: boolean;
    allowDeletion?: boolean;
    album?: AlbumResponseDto;
    primarySortGroupKeys?: string[];
    primarySortGroupDescriptions?: Record<string, string | null | undefined>;
    primarySortGroupColors?: Record<string, string | null | undefined>;
    viewportScrollTop?: number;
  };

  let {
    assets = $bindable(),
    viewerAssets,
    assetInteraction,
    disableAssetSelect = false,
    showArchiveIcon = false,
    viewport,
    onEndReached = undefined,
    showAssetName = false,
    displayAssetInfo,
    onReload = undefined,
    slidingWindowOffset = 0,
    pageHeaderOffset = 0,
    arrowNavigation = true,
    allowDeletion = true,
    album,
    primarySortGroupKeys,
    primarySortGroupDescriptions,
    primarySortGroupColors,
    viewportScrollTop,
  }: Props = $props();

  const navigationAssets = $derived(viewerAssets ?? assets);

  const layoutOptions = $derived({
    spacing: 2,
    heightTolerance: 0.5,
    rowHeight: Math.floor(viewport.width) < 850 ? 100 : 235,
    rowWidth: Math.floor(viewport.width),
  });
  const geometry = $derived(
    primarySortGroupKeys?.length === assets.length
      ? getGroupedJustifiedLayoutFromAssets(
          assets,
          primarySortGroupKeys,
          layoutOptions,
          primarySortGroupDescriptions ? 96 : 32,
        )
      : getJustifiedLayoutFromAssets(assets, layoutOptions),
  );
  const dividerTops = $derived('dividerTops' in geometry ? (geometry.dividerTops as number[]) : []);
  const sanitizeDescription = (value: string) =>
    value
      .replaceAll(/<\/?(?:script|iframe|object|embed|style)[^>]*>/gi, '')
      .replaceAll(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replaceAll(/javascript\s*:/gi, '');
  const groupHeaderOffset = $derived(primarySortGroupDescriptions ? 64 : 0);
  const dividerLabels = $derived.by(() => {
    if (!primarySortGroupKeys || !primarySortGroupDescriptions) {
      return [] as Array<{ top: number; key: string; description?: string | null }>;
    }
    const labels: Array<{ top: number; key: string; description?: string | null }> = [];
    let groupIndex = 0;
    if (primarySortGroupKeys.length > 0) {
      const key = primarySortGroupKeys[0];
      labels.push({ top: -60, key, description: primarySortGroupDescriptions[key] });
    }
    for (let index = 1; index < primarySortGroupKeys.length; index++) {
      if (primarySortGroupKeys[index] !== primarySortGroupKeys[index - 1]) {
        const top = dividerTops[groupIndex++];
        const key = primarySortGroupKeys[index];
        labels.push({ top, key, description: primarySortGroupDescriptions[key] });
      }
    }
    return labels.filter(({ top }) => top !== undefined);
  });

  const getStyle = (index: number) => {
    return `top: ${geometry.getTop(index) + groupHeaderOffset}px; left: ${geometry.getLeft(index)}px; width: ${geometry.getWidth(index)}px; height: ${geometry.getHeight(index)}px;`;
  };

  const isInOrNearViewport = (index: number) => {
    const window = slidingWindow;
    const top = geometry.getTop(index) + groupHeaderOffset;
    return top + pageHeaderOffset < window.bottom && top + geometry.getHeight(index) > window.top;
  };

  let lastAssetMouseEvent: TimelineAsset | null = $state(null);
  let documentScrollTop = $state(0);

  let slidingWindow = $derived.by(() => {
    const scrollTop = viewportScrollTop ?? documentScrollTop;
    const top = scrollTop - slidingWindowOffset - INTERSECTION_EXPAND_TOP;
    const bottom = top + viewport.height + slidingWindowOffset + INTERSECTION_EXPAND_BOTTOM;
    return {
      top,
      bottom,
    };
  });

  const updateCurrentAsset = (asset: AssetResponseDto) => {
    const index = assets.findIndex((oldAsset) => oldAsset.id === asset.id);
    assets[index] = asset;
  };

  const updateSlidingWindow = () => (documentScrollTop = document.scrollingElement?.scrollTop ?? 0);

  const debouncedOnEndReached = debounce(() => onEndReached?.(), 750, { maxWait: 100, leading: true });

  let lastEndReachedHeight = 0;
  $effect(() => {
    if (geometry.containerHeight - slidingWindow.bottom > viewport.height) {
      return;
    }

    const contentHeight = geometry.containerHeight;
    if (lastEndReachedHeight !== contentHeight) {
      debouncedOnEndReached();
      lastEndReachedHeight = contentHeight;
    }
  });

  const selectAllAssets = () => {
    assetInteraction.selectAssets(assets.map((a) => toTimelineAsset(a)));
  };

  const handleSelectAssets = (asset: TimelineAsset) => {
    if (!asset) {
      return;
    }
    const deselect = assetInteraction.hasSelectedAsset(asset.id);

    // Select/deselect already loaded assets
    if (deselect) {
      for (const candidate of assetInteraction.candidates) {
        assetInteraction.removeAssetFromMultiselectGroup(candidate.id);
      }
      assetInteraction.removeAssetFromMultiselectGroup(asset.id);
    } else {
      for (const candidate of assetInteraction.candidates) {
        assetInteraction.selectAsset(candidate);
      }
      assetInteraction.selectAsset(asset);
    }

    assetInteraction.clearCandidates();
    assetInteraction.setAssetSelectionStart(deselect ? null : asset);
  };

  const handleSelectAssetCandidates = (asset: TimelineAsset | null) => {
    if (asset) {
      selectAssetCandidates(asset);
    }
    lastAssetMouseEvent = asset;
  };

  const selectAssetCandidates = (endAsset: TimelineAsset) => {
    if (!keyboardManager.shift) {
      return;
    }

    const startAsset = assetInteraction.startAsset;
    if (!startAsset) {
      return;
    }

    let start = assets.findIndex((a) => a.id === startAsset.id);
    let end = assets.findIndex((a) => a.id === endAsset.id);

    if (start > end) {
      [start, end] = [end, start];
    }

    assetInteraction.setAssetSelectionCandidates(assets.slice(start, end + 1).map((a) => toTimelineAsset(a)));
  };

  const onSelectStart = (event: Event) => {
    if (assetInteraction.selectionActive && keyboardManager.shift) {
      event.preventDefault();
    }
  };

  const onDelete = () => {
    const hasTrashedAsset = assetInteraction.assets.some((asset) => asset.isTrashed);
    handlePromiseError(trashOrDelete(hasTrashedAsset));
  };

  const trashOrDelete = async (force: boolean = false) => {
    const forceOrNoTrash = force || !featureFlagsManager.value.trash;
    const selectedAssets = assetInteraction.assets;

    if ($showDeleteModal && forceOrNoTrash) {
      const confirmed = await modalManager.show(AssetDeleteConfirmModal, { size: selectedAssets.length });
      if (!confirmed) {
        return;
      }
    }

    await deleteAssets(
      forceOrNoTrash,
      (assetIds) => (assets = assets.filter((asset) => !assetIds.includes(asset.id))),
      selectedAssets,
      onReload,
    );

    assetInteraction.clear();
  };

  const toggleArchive = async () => {
    const ids = await archiveAssets(
      assetInteraction.assets,
      assetInteraction.isAllArchived ? AssetVisibility.Timeline : AssetVisibility.Archive,
    );
    if (ids) {
      assets = assets.filter((asset) => !ids.includes(asset.id));
      assetInteraction.clear();
    }
  };

  const focusNextAsset = () => moveFocus((element) => element.dataset.thumbnailFocusContainer !== undefined, 'next');
  const focusPreviousAsset = () =>
    moveFocus((element) => element.dataset.thumbnailFocusContainer !== undefined, 'previous');

  let isShortcutModalOpen = false;

  const handleOpenShortcutModal = async () => {
    if (isShortcutModalOpen) {
      return;
    }

    isShortcutModalOpen = true;
    await modalManager.show(ShortcutsModal, {});
    isShortcutModalOpen = false;
  };

  const shortcutList = $derived(
    (() => {
      if (assetViewerManager.isViewing) {
        return [];
      }

      const shortcuts: ShortcutOptions[] = [
        { shortcut: { key: '?', shift: true }, onShortcut: handleOpenShortcutModal },
        { shortcut: { key: '/' }, onShortcut: () => goto(Route.explore()) },
        { shortcut: { key: 'A', ctrl: true }, onShortcut: () => selectAllAssets() },
        ...(arrowNavigation
          ? [
              { shortcut: { key: 'ArrowRight' }, preventDefault: false, onShortcut: focusNextAsset },
              { shortcut: { key: 'ArrowLeft' }, preventDefault: false, onShortcut: focusPreviousAsset },
            ]
          : []),
      ];

      if (assetInteraction.selectionActive) {
        shortcuts.push(
          { shortcut: { key: 'Escape' }, onShortcut: () => assetInteraction.clear() },
          { shortcut: { key: 'D', ctrl: true }, onShortcut: () => assetInteraction.clear() },
        );
        if (allowDeletion) {
          shortcuts.push(
            { shortcut: { key: 'Delete' }, onShortcut: onDelete },
            { shortcut: { key: 'Delete', shift: true }, onShortcut: () => trashOrDelete(true) },
            { shortcut: { key: 'a', shift: true }, onShortcut: toggleArchive },
          );
        }
      }

      return shortcuts;
    })(),
  );

  const handleRandom = async (): Promise<{ id: string } | undefined> => {
    if (navigationAssets.length === 0) {
      return;
    }
    try {
      const randomIndex = Math.floor(Math.random() * navigationAssets.length);
      const asset = navigationAssets[randomIndex];

      await navigateToAsset(asset);
      return asset;
    } catch (error) {
      handleError(error, $t('errors.cannot_navigate_next_asset'));
      return;
    }
  };

  const handleAction = async (action: Action) => {
    switch (action.type) {
      case AssetAction.ARCHIVE:
      case AssetAction.DELETE:
      case AssetAction.TRASH: {
        const nextAsset = assetCursor.nextAsset ?? assetCursor.previousAsset;
        assets.splice(
          assets.findIndex((currentAsset) => currentAsset.id === action.asset.id),
          1,
        );
        if (assets.length === 0) {
          return await goto(Route.photos());
        }
        if (nextAsset) {
          await navigateToAsset(nextAsset);
        }
        break;
      }
      // no default
    }
  };

  const assetMouseEventHandler = (asset: TimelineAsset | null) => {
    if (assetInteraction.selectionActive) {
      handleSelectAssetCandidates(asset);
    }
  };

  $effect(() => {
    if (!lastAssetMouseEvent) {
      assetInteraction.clearCandidates();
    }
  });

  $effect(() => {
    if (!keyboardManager.shift) {
      assetInteraction.clearCandidates();
    }
  });

  $effect(() => {
    if (keyboardManager.shift && lastAssetMouseEvent) {
      selectAssetCandidates(lastAssetMouseEvent);
    }
  });

  const assetCursor = $derived<AssetCursor>({
    current: assetViewerManager.asset!,
    nextAsset: getNextAsset(navigationAssets, assetViewerManager.asset),
    previousAsset: getPreviousAsset(navigationAssets, assetViewerManager.asset),
  });
</script>

<svelte:document onselectstart={onSelectStart} use:shortcuts={shortcutList} onscroll={() => updateSlidingWindow()} />

{#if assets.length > 0}
  <div
    style:position="relative"
    style:height={geometry.containerHeight + groupHeaderOffset + 'px'}
    style:width={geometry.containerWidth + 'px'}
  >
    {#each dividerLabels as label (label.top + label.key)}
      <div
        class="absolute inset-x-0 z-10 border-t border-gray-300 bg-white/90 px-2 text-xs text-gray-500 dark:border-gray-600 dark:bg-immich-dark-gray/90"
        style:top={`${label.top + groupHeaderOffset}px`}
      >
        <div class="max-w-[90%] truncate">
          {#if primarySortGroupColors?.[label.key]}
            <span class="me-1 inline-block size-2.5 rounded-full" style:background-color={primarySortGroupColors[label.key]}></span>
          {/if}
          <a class="font-semibold underline hover:text-primary" href={Route.tags({ path: label.key })}>{label.key}</a>
        </div>
        {#if label.description}<div class="max-w-[90%] truncate text-xs text-gray-600 dark:text-gray-300">{@html sanitizeDescription(label.description)}</div>{/if}
      </div>
    {/each}
    {#each assets as asset, index (asset.id + '-' + index)}
      {#if isInOrNearViewport(index)}
        {@const currentAsset = toTimelineAsset(asset)}
        <div class="absolute" style:overflow="clip" style={getStyle(index)}>
          <Thumbnail
            readonly={disableAssetSelect}
            onClick={() => {
              if (assetInteraction.selectionActive) {
                handleSelectAssets(currentAsset);
                return;
              }
              void navigateToAsset(asset);
            }}
            onSelect={() => handleSelectAssets(currentAsset)}
            onPreview={assetInteraction.selectionActive ? () => void navigateToAsset(asset) : undefined}
            onMouseEvent={() => assetMouseEventHandler(currentAsset)}
            {showArchiveIcon}
            asset={currentAsset}
            selected={assetInteraction.hasSelectedAsset(currentAsset.id)}
            selectionCandidate={assetInteraction.hasSelectionCandidate(currentAsset.id)}
            thumbnailWidth={geometry.getWidth(index)}
            thumbnailHeight={geometry.getHeight(index)}
          />
          {#if displayAssetInfo && !isTimelineAsset(asset)}
            <GalleryAssetInfo {asset} settings={displayAssetInfo} />
          {:else if showAssetName && !isTimelineAsset(asset)}
            <div
              class="absolute bottom-0 w-full overflow-clip bg-slate-50/75 bg-linear-to-t p-1 text-center font-mono text-xs font-semibold text-ellipsis whitespace-pre-wrap dark:bg-slate-800/75"
            >
              {asset.originalFileName}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<!-- Overlay Asset Viewer -->
{#if assetViewerManager.isViewing}
  <Portal target="body">
    {#await import('$lib/components/asset-viewer/AssetViewer.svelte') then { default: AssetViewer }}
      <AssetViewer
        cursor={assetCursor}
        {album}
        onAction={handleAction}
        onRandom={handleRandom}
        onAssetChange={updateCurrentAsset}
        onClose={() => {
          assetViewerManager.showAssetViewer(false);
          handlePromiseError(navigate({ targetRoute: 'current', assetId: null }));
        }}
      />
    {/await}
  </Portal>
{/if}
