<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import StoryPlaybackViewer from '$lib/components/story-page/StoryPlaybackViewer.svelte';
  import StoryShareModal from '$lib/components/story-page/StoryShareModal.svelte';
  import { Route } from '$lib/route';
  import { getAssetPlaybackPath, getBaseUrl } from '@immich/sdk';
  import { Button, modalManager } from '@immich/ui';
  import { mdiArrowLeft } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { StoryDocumentDto } from '$lib/services/story.service';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const initialOffsetMs = Math.max(0, Number(page.url.searchParams.get('t') || 0));
  const revisionId =
    page.url.searchParams.get('revisionId') ??
    ('revisionId' in data.document ? data.document.revisionId : data.story.draftRevisionId);
  const shareFromHere = (pageId: string, offsetMs: number) =>
    modalManager.show(StoryShareModal, { storyId: data.story.id, pageId, offsetMs });
</script>

<main class="flex h-dvh flex-col bg-black text-white">
  <header class="p-2">
    <Button variant="ghost" leadingIcon={mdiArrowLeft} onclick={() => goto(Route.viewStory(data.story))}
      >{data.story.title}{data.historical ? ` · ${$t('story_historical_revision')}` : ''}</Button
    >
  </header>
  <StoryPlaybackViewer
    document={data.document.document as unknown as StoryDocumentDto}
    aspectRatio={data.story.aspectRatio}
    initialPageId={page.url.searchParams.get('page')}
    {initialOffsetMs}
    autoplay={page.url.searchParams.get('play') === '1'}
    onShareFromHere={data.story.role === 'owner' && data.story.publishedRevisionId ? shareFromHere : undefined}
    mediaResolver={(assetId, kind) => ({
      imageUrl: `${getBaseUrl()}/stories/${data.story.id}/revisions/${revisionId}/assets/${assetId}/rendition`,
      posterUrl: `${getBaseUrl()}/stories/${data.story.id}/revisions/${revisionId}/assets/${assetId}/rendition`,
      videoUrl: kind === 'video' ? `${getBaseUrl()}${getAssetPlaybackPath(assetId)}` : undefined,
    })}
  />
</main>
