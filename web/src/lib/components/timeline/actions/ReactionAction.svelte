<script lang="ts">
  import ReactionPicker from '$lib/components/asset-viewer/ReactionPicker.svelte';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { createActivity, ReactionType } from '@immich/sdk';
  import { toastManager } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    albumId: string;
  }

  let { albumId }: Props = $props();
  let loading = $state(false);

  const handleReaction = async ({ key }: { key: string }) => {
    const assets = assetMultiSelectManager.assets;
    if (assets.length === 0 || loading) return;

    loading = true;
    try {
      await Promise.all(
        assets.map(({ id: assetId }) =>
          createActivity({
            activityCreateDto: { albumId, assetId, type: ReactionType.Like, reactionKey: key },
          }),
        ),
      );
      await activityManager.refreshActivities(albumId);
      toastManager.primary(`Reacted to ${assets.length} selected photo${assets.length === 1 ? '' : 's'}`);
      assetMultiSelectManager.clear();
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_comment'));
    } finally {
      loading = false;
    }
  };
</script>

<div class:opacity-50={loading} class:pointer-events-none={loading}>
  <ReactionPicker
    buttonLabel="React to selected photos"
    placement="below"
    selectedEmoji="😀"
    onSelect={handleReaction}
  />
</div>
