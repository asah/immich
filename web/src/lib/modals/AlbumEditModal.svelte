<script lang="ts">
  import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
  import { handleUpdateAlbum } from '$lib/services/album.service';
  import { type AlbumResponseDto } from '@immich/sdk';
  import { Field, FormModal, Input, Textarea } from '@immich/ui';
  import { mdiRenameOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    onClose: () => void;
  };

  let { album, onClose }: Props = $props();

  let albumName = $state(album.albumName);
  let description = $state(album.description);
  const slugify = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  let slug = $state(album.slug ?? slugify(album.albumName));
  let slugEdited = $state(false);

  $effect(() => {
    if (!slugEdited) slug = slugify(albumName);
  });

  const onSubmit = async () => {
    const success = await handleUpdateAlbum(album, { albumName, description: description || null, slug: slug || null });
    if (success) {
      onClose();
    }
  };
</script>

<FormModal icon={mdiRenameOutline} title={$t('edit_album')} size="medium" {onClose} {onSubmit}>
  <div class="m-4 flex items-center gap-8">
    <AlbumCover {album} class="hidden size-50 shadow-lg sm:flex" />

    <div class="flex grow flex-col gap-4">
      <Field label={$t('name')}>
        <Input bind:value={albumName} />
      </Field>

      <Field label="Album URL" description="Suggested from the name; leave blank to keep the ID URL.">
        <Input bind:value={slug} oninput={() => (slugEdited = true)} />
      </Field>

      <Field label={$t('description')}>
        <Textarea bind:value={description} />
      </Field>
    </div>
  </div>
</FormModal>
