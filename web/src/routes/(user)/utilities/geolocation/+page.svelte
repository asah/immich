<script lang="ts">
  import { isDefined } from '$lib';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import type { TimelineDay } from '$lib/managers/timeline-manager/timeline-day.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import GeolocationPointPickerModal from '$lib/modals/GeolocationPointPickerModal.svelte';
  import GeolocationUpdateConfirmModal from '$lib/modals/GeolocationUpdateConfirmModal.svelte';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';
  import type { LatLng } from '$lib/types';
  import { getAssetMediaUrl } from '$lib/utils';
  import { setQueryValue } from '$lib/utils/navigation';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, getAssetInfo, updateAssets } from '@immich/sdk';
  import { Button, LoadingSpinner, modalManager, Text } from '@immich/ui';
  import { mdiLightbulbOutline, mdiMapMarkerMultipleOutline, mdiPencilOutline, mdiSelectRemove } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let isLoading = $state(false);
  let point = $state<LatLng>();
  let locationUpdated = $state(false);
  let mode = $state<'manual' | 'suggestions'>('manual');
  type LocationSuggestion = {
    assetIds: string[];
    latitude: number;
    longitude: number;
    locality: string;
    accuracyMeters: number;
    confidence: number;
    timeWindowMinutes: number;
  };
  let suggestions: LocationSuggestion[] = $state([]);
  let suggestionsLoading = $state(false);

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const options = {
    visibility: AssetVisibility.Timeline,
    withStacked: true,
    withPartners: true,
    withCoordinates: true,
  };

  const isOwnAsset = (asset: TimelineAsset) => asset.ownerId === authManager.user.id;

  const handleUpdate = async (
    assetIds = assetMultiSelectManager.assets.filter((asset) => isOwnAsset(asset)).map((asset) => asset.id),
  ) => {
    if (!point) {
      return;
    }

    const confirmed = await modalManager.show(GeolocationUpdateConfirmModal, {
      point,
      assetCount: assetIds.length,
    });

    if (!confirmed) {
      return;
    }

    await updateAssets({
      assetBulkUpdateDto: {
        ids: assetIds,
        latitude: point.lat,
        longitude: point.lng,
      },
    });

    const updatedAssets = await Promise.all(
      assetIds.map(async (id) => {
        const updatedAsset = await getAssetInfo({ ...authManager.params, id });
        return toTimelineAsset(updatedAsset);
      }),
    );

    timelineManager.upsertAssets(updatedAssets);

    assetMultiSelectManager.clear();
  };

  const loadSuggestions = async () => {
    suggestionsLoading = true;
    try {
      const response = await fetch('/api/assets/location-suggestions');
      if (!response.ok) throw new Error(String(response.status));
      suggestions = await response.json();
    } finally {
      suggestionsLoading = false;
    }
  };

  const showSuggestion = (suggestion: LocationSuggestion) => {
    point = { lat: suggestion.latitude, lng: suggestion.longitude };
  };

  const previewSuggestion = async (suggestion: LocationSuggestion) => {
    showSuggestion(suggestion);
    const selected = await modalManager.show(GeolocationPointPickerModal, { point });
    if (selected) point = selected;
  };

  const applySuggestion = async (suggestion: LocationSuggestion) => {
    showSuggestion(suggestion);
    await handleUpdate(suggestion.assetIds);
    suggestions = suggestions.filter((item) => item !== suggestion);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
    if (event.key === 'Escape' && assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
  };

  const handlePickPoint = async () => {
    const selected = await modalManager.show(GeolocationPointPickerModal, { point });
    if (!selected) {
      return;
    }

    point = selected;
  };
  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };

  type AssetPoint = { latitude: number; longitude: number };

  const hasGps = (asset: TimelineAsset | AssetPoint): asset is AssetPoint =>
    isDefined(asset.latitude) && isDefined(asset.longitude);

  const handleThumbnailClick = (
    asset: TimelineAsset,
    timelineManager: TimelineManager,
    timelineDay: TimelineDay,
    onClick: (
      timelineManager: TimelineManager,
      assets: TimelineAsset[],
      groupTitle: string,
      asset: TimelineAsset,
    ) => void,
  ) => {
    if (keyboardManager.shift) {
      onClick(timelineManager, timelineDay.getAssets(), timelineDay.groupTitle, asset);
    } else if (hasGps(asset)) {
      locationUpdated = true;
      setTimeout(() => {
        locationUpdated = false;
      }, 1500);
      point = { lat: asset.latitude, lng: asset.longitude };
      void setQueryValue('at', asset.id);
    } else if (isOwnAsset(asset)) {
      onClick(timelineManager, timelineDay.getAssets(), timelineDay.groupTitle, asset);
    }
  };
</script>

<svelte:document onkeydown={onKeyDown} onkeyup={onKeyUp} />

<UserPageLayout title={data.meta.title} scrollbar={true}>
  {#snippet buttons()}
    <div class="flex place-items-center justify-end gap-2">
      <Button
        size="small"
        color="secondary"
        variant={mode === 'suggestions' ? 'filled' : 'ghost'}
        leadingIcon={mdiLightbulbOutline}
        onclick={() => {
          mode = mode === 'manual' ? 'suggestions' : 'manual';
          if (mode === 'suggestions' && suggestions.length === 0) void loadSuggestions();
        }}>Suggestions</Button
      >
      <Text class="mr-4 hidden md:block" size="tiny" color="muted">{$t('geolocation_instruction_location')}</Text>
      <div class="flex place-content-center place-items-center rounded-2xl border bg-primary/10 px-2 py-1">
        <Text class="mr-5 ml-2 hidden font-mono md:inline-block" color="muted" size="tiny">
          {$t('selected_gps_coordinates')}
        </Text>
        <Text
          title="latitude, longitude"
          class="rounded-3xl px-2 py-1 font-mono text-sm text-primary transition-all duration-100 ease-in-out {locationUpdated
            ? 'scale-105 bg-primary/90 font-semibold text-light'
            : ''}"
        >
          {#if point}
            {point.lat.toFixed(3)}, {point.lng.toFixed(3)}
          {:else}
            {$t('none')}
          {/if}
        </Text>
      </div>

      <Button size="small" color="secondary" variant="ghost" leadingIcon={mdiPencilOutline} onclick={handlePickPoint}>
        <Text class="hidden sm:inline-block">{$t('location_picker_choose_on_map')}</Text>
      </Button>
      <Button
        leadingIcon={mdiSelectRemove}
        size="small"
        color="secondary"
        variant="ghost"
        disabled={!assetMultiSelectManager.selectionActive}
        onclick={() => assetMultiSelectManager.clear()}
      >
        {$t('unselect_all')}
      </Button>
      <Button
        leadingIcon={mdiMapMarkerMultipleOutline}
        size="small"
        color="primary"
        disabled={assetMultiSelectManager.assets.length === 0}
        onclick={() => handleUpdate()}
      >
        <Text class="hidden sm:inline-block">
          {$t('apply_count', { values: { count: assetMultiSelectManager.assets.length } })}
        </Text>
      </Button>
    </div>
  {/snippet}

  {#if isLoading}
    <div class="flex size-full items-center justify-center">
      <LoadingSpinner size="giant" />
    </div>
  {/if}

  {#if mode === 'suggestions'}
    <section class="mx-auto max-w-5xl p-6">
      <Text size="large" fontWeight="semi-bold">Location suggestions</Text>
      <Text class="mt-1 block" color="muted" size="small"
        >Only nearby, same-owner GPS evidence that agrees within 500 m is shown.</Text
      >
      {#if suggestionsLoading}
        <div class="flex h-48 items-center justify-center"><LoadingSpinner size="giant" /></div>
      {:else if suggestions.length === 0}
        <EmptyPlaceholder text="No high-confidence location suggestions" onClick={() => {}} class="mx-auto mt-10" />
      {:else}
        <div class="mt-6 grid gap-4 md:grid-cols-2">
          {#each suggestions as suggestion (suggestion.assetIds.join())}
            <article class="rounded-xl border bg-subtle p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <Text fontWeight="semi-bold">{suggestion.locality}</Text>
                  <Text class="mt-1 block" color="muted" size="small">
                    {suggestion.assetIds.length} photo{suggestion.assetIds.length === 1 ? '' : 's'} · within {suggestion.timeWindowMinutes}
                    min · approximately {suggestion.accuracyMeters} m
                  </Text>
                </div>
                <span class="rounded-full bg-success px-2 py-1 text-xs text-black">High confidence</span>
              </div>
              <div class="mt-3 flex -space-x-2 overflow-hidden">
                {#each suggestion.assetIds.slice(0, 5) as id (id)}
                  <img
                    class="size-12 rounded-md border-2 border-white object-cover dark:border-gray-900"
                    src={getAssetMediaUrl({ id })}
                    alt="Missing-location asset"
                  />
                {/each}
              </div>
              <div class="mt-4 flex gap-2">
                <Button size="small" color="secondary" variant="ghost" onclick={() => void previewSuggestion(suggestion)}
                  >Preview on map</Button
                >
                <Button size="small" onclick={() => void applySuggestion(suggestion)}>Apply suggestion</Button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <Timeline
      isSelectionMode={true}
      enableRouting={true}
      bind:timelineManager
      {options}
      assetInteraction={assetMultiSelectManager}
      removeAction={AssetAction.ARCHIVE}
      onEscape={handleEscape}
      withStacked
      onThumbnailClick={handleThumbnailClick}
    >
      {#snippet customThumbnailLayout(asset: TimelineAsset)}
        {#if !isOwnAsset(asset)}
          <div class="pointer-events-none absolute inset-0 rounded-sm bg-black/40"></div>
        {/if}
        {#if hasGps(asset)}
          <div class="absolute inset-e-3 bottom-1 rounded-xl bg-success px-4 py-1 text-xs text-black transition-colors">
            {asset.city || $t('gps')}
          </div>
        {:else}
          <div class="absolute inset-e-3 bottom-1 rounded-xl bg-danger px-4 py-1 text-xs text-light transition-colors">
            {$t('gps_missing')}
          </div>
        {/if}
      {/snippet}
      {#snippet empty()}
        <EmptyPlaceholder text={$t('no_assets_message')} onClick={() => {}} class="mx-auto mt-10" />
      {/snippet}
    </Timeline>
  {/if}
</UserPageLayout>
