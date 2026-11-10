<script lang="ts">
  import { assetViewerManager } from '#lib/managers/asset-viewer-manager.svelte.ts';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import MapModal from '#lib/modals/MapModal.svelte';
  import { handleError } from '#lib/utils/handle-error.ts';
  import { navigate } from '#lib/utils/navigation.ts';
  import { getAlbumMapMarkers, type AlbumResponseDto, type MapMarkerResponseDto } from '@immich/sdk';
  import { IconButton, modalManager } from '@immich/ui';
  import { mdiMapOutline } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
  }

  let { album }: Props = $props();

  let returnToMap = $state(false);
  let mapMarkers: MapMarkerResponseDto[] = $state([]);
  let cancelable: AbortController | undefined;

  onMount(() => {
    void refreshMapMarkers();
  });

  onDestroy(() => {
    assetViewerManager.showAssetViewer(false);
  });

  $effect(() => {
    if (assetViewerManager.isViewing || !returnToMap) {
      return;
    }

    returnToMap = false;
    void onClick();
  });

  const loadMapMarkers = async () => {
    cancelable?.abort();
    cancelable = new AbortController();

    try {
      return await getAlbumMapMarkers({ ...authManager.params, id: album.id }, { signal: cancelable.signal });
    } catch (error) {
      handleError(error, $t('errors.something_went_wrong'));
      return [];
    }
  };

  const refreshMapMarkers = async () => {
    mapMarkers = await loadMapMarkers();
  };

  const onClick = async () => {
    // The button can be used before the background preload finishes. Fetching here
    // ensures the modal always receives the album's current markers and bounds.
    await refreshMapMarkers();
    const assetIds = await modalManager.show(MapModal, { mapMarkers });
    if (assetIds) {
      await navigate({ targetRoute: 'current', assetId: assetIds[0] });
      returnToMap = true;
    } else {
      returnToMap = false;
    }
  };
</script>

<IconButton
  variant="ghost"
  shape="round"
  color="secondary"
  icon={mdiMapOutline}
  onclick={onClick}
  aria-label={$t('map')}
/>
