<script lang="ts">
  import {
    STORY_PAGE_SIZES,
    getStoryElementLabel,
    type StoryElement,
    type StoryMediaResolver,
    type StoryScene,
    type StoryStickerResolver,
    type StoryAspectRatio,
  } from '$lib/utils/story-model';
  import type { StoryMotionPolicy } from '$lib/utils/story-clock';
  import StoryElementView from './StoryElement.svelte';

  type Props = {
    scene: StoryScene;
    aspectRatio: StoryAspectRatio;
    pageTime?: number;
    motion?: StoryMotionPolicy;
    mediaResolver?: StoryMediaResolver;
    stickerResolver?: StoryStickerResolver;
    label?: string;
  };

  let {
    scene,
    aspectRatio,
    pageTime = 0,
    motion = 'full',
    mediaResolver,
    stickerResolver,
    label = 'Story page',
  }: Props = $props();
  const size = $derived(STORY_PAGE_SIZES[aspectRatio]);
  const byId = $derived(new Map(scene.elements.map((element) => [element.id, element])));
  const readingElements = $derived(
    scene.readingOrder.map((id) => byId.get(id)).filter((item): item is StoryElement => !!item),
  );
</script>

<section
  class="relative isolate overflow-hidden"
  data-story-page={scene.id}
  aria-label={label}
  style:width={`${size.width}px`}
  style:height={`${size.height}px`}
  style:background={scene.background === 'theme' ? '#FFFFFF' : scene.background}
>
  <div class="absolute inset-0">
    {#each scene.elements as element, index (element.id)}
      <!-- Keep the document order explicit in CSS. Every element has a transform (and
        therefore its own stacking context), so relying on DOM order alone made
        stickers intermittently render below images after a layer move. -->
      <div class="absolute inset-0" style:z-index={index}>
        <StoryElementView {element} {pageTime} {motion} {mediaResolver} {stickerResolver} />
      </div>
    {/each}
  </div>

  <div class="sr-only" data-story-reading-order>
    {#each readingElements as element (element.id)}
      {#if !element.ariaHidden}
        {#if element.type === 'text'}
          <p>{element.text ?? ''}</p>
        {:else if element.type !== 'video'}
          <div role="img" aria-label={getStoryElementLabel(element)}></div>
        {/if}
      {/if}
    {/each}
  </div>
</section>
