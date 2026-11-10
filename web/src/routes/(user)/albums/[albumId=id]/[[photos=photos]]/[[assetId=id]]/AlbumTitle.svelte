<script lang="ts">
  import { updateAlbumInfoMutation } from '#lib/queries/album.query.ts';
  import { executeMutation } from '#lib/queries/client.ts';
  import { Textarea } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import { fromAction } from 'svelte/attachments';
  import { shortcut } from '$lib/actions/shortcut';
  import { getAssetMediaUrl } from '$lib/utils';

  type Props = {
    id: string;
    albumName: string;
    albumThumbnailAssetId?: string | null;
    isEditor: boolean;
    onUpdate?: (albumName: string) => void;
  };

  let { id, albumName = $bindable(), albumThumbnailAssetId, isEditor, onUpdate }: Props = $props();

  let newAlbumName = $derived(albumName);

  const handleUpdate = async () => {
    newAlbumName = newAlbumName.replaceAll('\n', ' ').trim();

    if (newAlbumName === albumName) {
      return;
    }

    await executeMutation(
      () => updateAlbumInfoMutation({ error: { toast: 'errors.unable_to_save_album' } }),
      [{ id, updateAlbumDto: { albumName: newAlbumName } }],
    );
    onUpdate?.(newAlbumName);
  };

  const textClasses = 'text-2xl lg:text-6xl text-primary';
</script>

<div class="mb-2 flex items-center gap-4">
  {#if albumThumbnailAssetId}
    <img
      class="size-16 shrink-0 rounded-xl object-cover shadow-sm md:size-20"
      src={getAssetMediaUrl({ id: albumThumbnailAssetId })}
      alt={albumName || $t('unnamed_album')}
      data-testid="album-header-cover"
    />
  {/if}
  <div class="min-w-0 grow">
    {#if isEditor}
      <Textarea
        bind:value={newAlbumName}
        variant="ghost"
        title={$t('edit_title')}
        onblur={handleUpdate}
        placeholder={$t('add_a_title')}
        class={textClasses}
        {@attach fromAction(shortcut, () => ({
          shortcut: { key: 'Enter' },
          onShortcut: (event) => event.currentTarget.blur(),
        }))}
      />
    {:else}
      <div class={textClasses}>{newAlbumName}</div>
    {/if}
  </div>
</div>
