<script lang="ts">
  import { StoryPageViewport } from '$lib/components/stories';
  import type { StoryAspectRatio, StoryMediaResolver, StoryScene } from '$lib/utils/story-model';
  import type { StoryDocumentDto, StoryAspectRatio as ApiAspectRatio } from '$lib/services/story.service';
  import { Button } from '@immich/ui';
  import { mdiChevronLeft, mdiChevronRight, mdiPause, mdiPlay } from '@mdi/js';
  import { onMount, tick as domTick } from 'svelte';
  import { t } from 'svelte-i18n';
  let {
    document: storyDocument,
    aspectRatio,
    initialPageId,
    initialOffsetMs = 0,
    autoplay = false,
    mediaResolver,
    onShareFromHere,
  }: {
    document: StoryDocumentDto;
    aspectRatio: ApiAspectRatio;
    initialPageId?: string | null;
    initialOffsetMs?: number;
    autoplay?: boolean;
    mediaResolver: StoryMediaResolver;
    onShareFromHere?: (pageId: string, offsetMs: number) => void;
  } = $props();
  const scenes = [storyDocument.cover, ...storyDocument.pages];
  let index = $state(
    Math.max(
      0,
      scenes.findIndex(({ id }) => id === initialPageId),
    ),
  );
  let pageTime = $state(Math.max(0, Math.min(initialOffsetMs, scenes[index].durationMs ?? 6000)));
  let playing = $state(autoplay);
  let reducedMotion = $state(false);
  let frame: number | undefined;
  let last = 0;
  let ready = $state(false);
  let viewport: HTMLDivElement;
  const viewScene = $derived({
    ...scenes[index],
    template: 'blank',
    transition: { preset: 'none', durationMs: 0 },
  } as unknown as StoryScene);
  const viewAspectRatio = (
    { portrait_4_5: 'portrait-4:5', landscape_16_9: 'landscape-16:9', square_1_1: 'square-1:1' } as const
  )[aspectRatio] as StoryAspectRatio;
  const move = (delta: number) => {
    index = Math.max(0, Math.min(scenes.length - 1, index + delta));
    pageTime = 0;
    last = performance.now();
  };
  const tick = (now: number) => {
    if (playing && !documentHidden) {
      pageTime += Math.max(0, now - last);
      if (pageTime >= (scenes[index].durationMs ?? 6000)) {
        if (index < scenes.length - 1) move(1);
        else playing = false;
      }
    }
    last = now;
    frame = requestAnimationFrame(tick);
  };
  let documentHidden = $state(false);
  onMount(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    if (reducedMotion) playing = false;
    const visibility = () => {
      documentHidden = document.hidden;
      last = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    const prepare = async () => {
      await domTick();
      const mediaReady = Promise.all(
        [...viewport.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')].map((media) => {
          if (media instanceof HTMLImageElement)
            return media.complete
              ? media.decode().catch(() => undefined)
              : new Promise<void>((resolve) => media.addEventListener('load', () => resolve(), { once: true }));
          return media.readyState >= 2
            ? Promise.resolve()
            : new Promise<void>((resolve) => media.addEventListener('loadeddata', () => resolve(), { once: true }));
        }),
      );
      const fontReady = document.fonts?.ready ?? Promise.resolve();
      await Promise.race([Promise.all([fontReady, mediaReady]), new Promise((resolve) => setTimeout(resolve, 5000))]);
      ready = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    void prepare();
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      if (frame) cancelAnimationFrame(frame);
    };
  });
</script>

<div class="grid min-h-0 flex-1 grid-rows-[1fr_auto]">
  <div class="min-h-0" bind:this={viewport} aria-busy={!ready}>
    <StoryPageViewport
      scene={viewScene}
      aspectRatio={viewAspectRatio}
      {pageTime}
      motion={reducedMotion ? 'reduced' : 'full'}
      {mediaResolver}
      label={index === 0 ? $t('story_cover') : $t('story_page_number', { values: { number: index } })}
    />
  </div>
  <nav class="flex min-h-14 flex-wrap items-center justify-center gap-3 p-2" aria-label={$t('story_playback_controls')}>
    <Button variant="ghost" leadingIcon={mdiChevronLeft} disabled={index === 0} onclick={() => move(-1)}
      >{$t('previous')}</Button
    ><Button
      leadingIcon={playing ? mdiPause : mdiPlay}
      onclick={() => {
        playing = !playing;
        last = performance.now();
      }}>{playing ? $t('pause') : $t('play')}</Button
    ><Button
      variant="ghost"
      trailingIcon={mdiChevronRight}
      disabled={index === scenes.length - 1}
      onclick={() => move(1)}>{$t('next')}</Button
    >{#if onShareFromHere}<Button
        variant="ghost"
        onclick={() => onShareFromHere?.(scenes[index].id, Math.floor(pageTime))}>{$t('story_share_from_here')}</Button
      >{/if}<span class="text-sm" aria-live="polite"
      >{index === 0
        ? $t('story_cover')
        : $t('story_progress', { values: { current: index, total: scenes.length - 1 } })}</span
    >
  </nav>
</div>
