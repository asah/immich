<script lang="ts">
  import SharedLinkFormFields from '$lib/components/SharedLinkFormFields.svelte';
  import { Route } from '$lib/route';
  import { storyService } from '$lib/services/story.service';
  import { Checkbox, Field, FormModal, Label, toastManager } from '@immich/ui';
  import { mdiShareVariant } from '@mdi/js';
  import { t } from 'svelte-i18n';
  let {
    storyId,
    pageId,
    offsetMs = 0,
    onClose,
  }: { storyId: string; pageId: string; offsetMs?: number; onClose: () => void } = $props();
  let description = $state('');
  let password = $state('');
  let slug = $state('');
  let expiresAt = $state<string | null>(null);
  let allowDownload = $state(false);
  let allowUpload = $state(false);
  let showMetadata = $state(false);
  let startHere = $state(true);
  let error = $state('');
  const submit = async () => {
    error = '';
    try {
      const link = await storyService.createShare(storyId, {
        description,
        password,
        slug,
        expiresAt,
        startPageId: startHere ? pageId : null,
        startOffsetMs: startHere ? offsetMs : null,
        allowDownload,
      });
      const url = new URL(Route.viewSharedLink(link), location.origin).toString();
      await navigator.clipboard.writeText(url);
      toastManager.primary($t('story_share_copied'));
      onClose();
    } catch {
      error = $t('story_share_error');
    }
  };
</script>

<FormModal
  title={$t('story_share_title')}
  icon={mdiShareVariant}
  {onClose}
  onSubmit={submit}
  submitText={$t('create_link')}
>
  <SharedLinkFormFields
    bind:slug
    bind:password
    bind:description
    bind:allowDownload
    bind:allowUpload
    bind:showMetadata
    bind:expiresAt
    allowUploadVisible={false}
    downloadRequiresMetadata={false}
  />
  {#if error}<p role="alert" class="text-red-600">{error}</p>{/if}
  <Field label={$t('story_share_start_at')} description={$t('story_share_start_description')}
    ><div class="flex items-center gap-2">
      <Checkbox id="story-start-current" bind:checked={startHere} /><Label
        for="story-start-current"
        label={$t('story_share_start_current')}
      />
    </div></Field
  >
</FormModal>
