<script lang="ts">
  import { getStoryViewportMetrics } from '$lib/utils/story-geometry';
  import type { StoryAspectRatio, StoryMediaResolver, StoryScene, StoryStickerResolver } from '$lib/utils/story-model';
  import type { StoryMotionPolicy } from '$lib/utils/story-clock';
  import StoryPage from './StoryPage.svelte';

  type Props = {
    scene: StoryScene;
    aspectRatio: StoryAspectRatio;
    pageTime?: number;
    motion?: StoryMotionPolicy;
    zoom?: number;
    mediaResolver?: StoryMediaResolver;
    stickerResolver?: StoryStickerResolver;
    label?: string;
  };
  let {
    scene,
    aspectRatio,
    pageTime = 0,
    motion = 'full',
    zoom = 1,
    mediaResolver,
    stickerResolver,
    label,
  }: Props = $props();
  let width = $state(0);
  let height = $state(0);
  const metrics = $derived(getStoryViewportMetrics(aspectRatio, width, height, zoom));
</script>

<div class="relative size-full overflow-hidden" bind:clientWidth={width} bind:clientHeight={height} data-story-viewport>
  {#if width > 0 && height > 0}
    <div
      class="absolute origin-top-left"
      style:left={`${metrics.offsetX}px`}
      style:top={`${metrics.offsetY}px`}
      style:transform={`scale(${metrics.scale})`}
    >
      <StoryPage {scene} {aspectRatio} {pageTime} {motion} {mediaResolver} {stickerResolver} {label} />
    </div>
  {/if}
</div>
