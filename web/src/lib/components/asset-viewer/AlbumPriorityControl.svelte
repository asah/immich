<script module lang="ts">
  import { getAlbumAssetPriorities } from '@immich/sdk';

  const albumPriorityCache = new Map<string, Promise<Map<string, number>>>();
  const getPriorityMap = (albumId: string) => {
    let request = albumPriorityCache.get(albumId);
    if (!request) {
      request = getAlbumAssetPriorities({ id: albumId }).then(
        (items) => new Map(items.flatMap(({ assetId, priority }) => (priority === null ? [] : [[assetId, priority]]))),
      );
      albumPriorityCache.set(albumId, request);
    }
    return request;
  };
</script>

<script lang="ts">
  import { shortcuts } from '$lib/actions/shortcut';
  import { handleError } from '$lib/utils/handle-error';
  import { updateAlbumAssetPriority } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  type Props = {
    albumId: string;
    assetId: string;
    priority?: number | null;
    onChange?: (priority: number | null) => void;
    canEdit?: boolean;
  };

  let { albumId, assetId, priority = $bindable(null), onChange, canEdit = false }: Props = $props();

  $effect(() => {
    const id = albumId;
    const currentAssetId = assetId;
    void getPriorityMap(id).then((items) => {
      if (id === albumId && currentAssetId === assetId) {
        priority = items.get(currentAssetId) ?? null;
      }
    });
  });

  const setPriority = async (value: number | null) => {
    try {
      await updateAlbumAssetPriority({
        id: albumId,
        updateAlbumAssetPriorityDto: { assetIds: [assetId], priority: value },
      });
      priority = value;
      const priorities = await getPriorityMap(albumId);
      value === null ? priorities.delete(assetId) : priorities.set(assetId, value);
      onChange?.(value);
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_album_info'));
    }
  };
</script>

<svelte:document
  use:shortcuts={canEdit
    ? [
        { shortcut: { key: '0' }, onShortcut: () => setPriority(null) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => ({
          shortcut: { key: String(value) },
          onShortcut: () => setPriority(value),
        })),
      ]
    : []}
/>

<div
  class="absolute top-20 left-4 z-20 flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-white shadow-lg"
>
  <label for="album-priority" class="text-sm font-medium">{$t('album_priority')}</label>
  <select
    id="album-priority"
    class="rounded bg-white/15 px-2 py-1 text-sm text-white"
    value={priority ?? 0}
    onchange={(event) => setPriority(Number(event.currentTarget.value) || null)}
    disabled={!canEdit}
  >
    <option value={0}>—</option>
    {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as value}
      <option {value}>{value}</option>
    {/each}
  </select>
</div>
