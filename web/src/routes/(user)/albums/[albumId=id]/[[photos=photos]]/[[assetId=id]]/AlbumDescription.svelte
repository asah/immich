<script lang="ts">
  import RichTextEditor from '$lib/components/shared-components/RichTextEditor.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { sanitizeRichText } from '$lib/utils/sanitize-rich-text';
  import { updateAlbumInfo } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    id: string;
    description: string;
    isOwned: boolean;
  }

  let { id, description = $bindable(), isOwned }: Props = $props();

  const handleFocusOut = async () => {
    try {
      const response = await updateAlbumInfo({
        id,
        updateAlbumDto: {
          description: description || null,
        },
      });
      eventManager.emit('AlbumUpdate', response);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_album'));
    }
  };
</script>

{#if isOwned}
  <RichTextEditor
    label={$t('description')}
    bind:value={description}
    onBlur={() => void handleFocusOut()}
    onSubmit={() => void handleFocusOut()}
  />
{:else if description}
  <div class="album-description wrap-break-words w-full text-base text-black dark:text-white">
    {@html sanitizeRichText(description)}
  </div>
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
