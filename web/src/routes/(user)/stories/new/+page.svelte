<script lang="ts">
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import StoryBrief from '$lib/components/story-page/StoryBrief.svelte';
  import { Route } from '$lib/route';
  import { storyService } from '$lib/services/story.service';
  import AlbumPickerModal from '$lib/modals/AlbumPickerModal.svelte';
  import StoryAssetPickerModal from '$lib/components/story-page/StoryAssetPickerModal.svelte';
  import { StoryAspectRatio } from '@immich/sdk';
  import { Button, Textarea, modalManager, toastManager } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let busy = $state(false);
  let value = $state({ title: '', description: '', aspectRatio: StoryAspectRatio.Portrait45 });
  let startMode = $state<'blank' | 'albums' | 'photos' | 'automatic' | 'ai'>(data.albumId ? 'albums' : 'blank');
  let albumIds = $state<string[]>(data.albumId ? [data.albumId] : []);
  let assetIds = $state<string[]>([]);
  let aiPrompt = $state('');
  const chooseAlbums = async () => {
    const albums = await modalManager.show(AlbumPickerModal);
    if (albums) albumIds = albums.map(({ id }) => id);
  };
  const choosePhotos = async () => {
    const assets = await modalManager.show(StoryAssetPickerModal);
    if (assets) assetIds = assets.map(({ id }) => id);
  };
  $effect(() => {
    const saved = localStorage.getItem('immich-story-brief');
    if (saved) {
      try {
        value = JSON.parse(saved);
      } catch {
        localStorage.removeItem('immich-story-brief');
      }
    }
  });
  $effect(() => {
    localStorage.setItem('immich-story-brief', JSON.stringify(value));
  });
  const create = async () => {
    if (startMode === 'automatic' && albumIds.length === 0) {
      toastManager.danger($t('story_automatic_source_required'));
      return;
    }
    busy = true;
    try {
      const story = await storyService.create(value);
      try {
        if (startMode !== 'blank' && (albumIds.length || assetIds.length))
          await storyService.importSelection(story.id, albumIds, assetIds, startMode === 'automatic');
      } catch {
        toastManager.danger($t('story_import_error'));
        await goto(Route.viewStory(story));
        return;
      }
      if (startMode === 'ai' && aiPrompt.trim())
        sessionStorage.setItem(`immich-story-ai-prompt-${story.id}`, aiPrompt.trim());
      localStorage.removeItem('immich-story-brief');
      await goto(Route.viewStory(story));
    } catch {
      toastManager.danger($t('story_create_error'));
    } finally {
      busy = false;
    }
  };
  const selectMode = (mode: typeof startMode) => {
    startMode = mode;
    if (mode !== 'albums' && mode !== 'automatic') albumIds = [];
    if (mode !== 'photos') assetIds = [];
  };
</script>

<UserPageLayout title={data.meta.title}
  ><div class="p-4 sm:p-8">
    <div class="mx-auto mb-5 flex max-w-2xl flex-wrap gap-2">
      {#each ['blank', 'albums', 'photos', 'automatic', 'ai'] as mode}<Button
          size="small"
          variant={startMode === mode ? 'filled' : 'ghost'}
          onclick={() => selectMode(mode as typeof startMode)}>{$t(`story_start_${mode}` as never)}</Button
        >{/each}
    </div>
    {#if startMode === 'albums' || startMode === 'automatic'}<div
        class="mx-auto mb-4 flex max-w-2xl items-center gap-2"
      >
        <Button onclick={chooseAlbums}>{$t('choose_albums')}</Button><span
          >{$t('story_albums_selected', { values: { count: albumIds.length } })}</span
        >
      </div>{/if}{#if startMode === 'photos'}<div class="mx-auto mb-4 flex max-w-2xl items-center gap-2">
        <Button onclick={choosePhotos}>{$t('story_choose_photos')}</Button><span
          >{$t('story_photos_selected', { values: { count: assetIds.length } })}</span
        >
      </div>{/if}{#if startMode === 'ai'}<div class="mx-auto mb-4 max-w-2xl">
        <Textarea bind:value={aiPrompt} placeholder={$t('story_ai_describe_placeholder')} />
      </div>{/if}<StoryBrief bind:value {busy} onSubmit={create} />
  </div></UserPageLayout
>
