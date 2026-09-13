<script lang="ts">
  import RichTextEditor from '$lib/components/shared-components/RichTextEditor.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { sanitizeRichText } from '$lib/utils/sanitize-rich-text';
  import { updateAlbumInfo } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    id: string;
    description: string;
    isOwned: boolean;
  }

  let { id, description = $bindable(), isOwned }: Props = $props();
  let editing = $state(false);
  let draft = $state(description);

  const save = async () => {
    try {
      const response = await updateAlbumInfo({
        id,
        updateAlbumDto: {
          description: draft || null,
        },
      });
      description = response.description;
      eventManager.emit('AlbumUpdate', response);
      editing = false;
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_album'));
    }
  };

  const edit = () => {
    draft = description;
    editing = true;
  };
</script>

{#if isOwned && editing}
  <RichTextEditor
    label={$t('description')}
    bind:value={draft}
    onSubmit={() => void save()}
  />
  <div class="mt-2 flex gap-2">
    <Button size="small" onclick={() => void save()}>{$t('save')}</Button>
    <Button
      size="small"
      color="secondary"
      onclick={() => {
        draft = description;
        editing = false;
      }}>{$t('cancel')}</Button
    >
  </div>
{:else}
  {#if description}
    <div class="album-description wrap-break-words w-full text-base text-black dark:text-white">
      {@html sanitizeRichText(description)}
    </div>
  {/if}
  {#if isOwned}
    <Button size="small" color="secondary" class="mt-2" onclick={edit}>{$t('edit')}</Button>
  {/if}
{/if}

<style>
  .album-description :global(p),
  .album-description :global(div) {
    margin-block: 0.5rem;
  }

  .album-description :global(a) {
    color: var(--color-immich-primary);
    text-decoration: underline;
  }
</style>
