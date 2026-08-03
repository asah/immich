<script lang="ts">
  import { getStoryAnimationState, isStoryVideoTriggered, type StoryMotionPolicy } from '$lib/utils/story-clock';
  import { storyElementTransform } from '$lib/utils/story-geometry';
  import {
    getStoryElementLabel,
    storyStyleNumber,
    storyStylePoint,
    storyStyleString,
    type StoryElement,
    type StoryMediaResolver,
    type StoryStickerResolver,
  } from '$lib/utils/story-model';

  type Props = {
    element: StoryElement;
    pageTime: number;
    motion: StoryMotionPolicy;
    mediaResolver?: StoryMediaResolver;
    stickerResolver?: StoryStickerResolver;
  };
  let { element, pageTime, motion, mediaResolver, stickerResolver }: Props = $props();
  let video = $state<HTMLVideoElement>();
  let autoplayBlocked = $state(false);
  let lastTriggered = false;
  const source = $derived(
    element.assetId
      ? mediaResolver?.(
          element.assetId,
          element.type === 'sticker' ? 'sticker' : element.type === 'video' ? 'video' : 'image',
        )
      : undefined,
  );
  const animation = $derived(getStoryAnimationState(element.animation ?? undefined, pageTime, motion));
  const border = $derived(element.type === 'image' || element.type === 'video' ? element.border : undefined);
  const focal = $derived(storyStylePoint(element, 'focalPoint', { x: 0.5, y: 0.5 }));
  const focalPosition = $derived({
    x: storyStyleNumber(element, 'focalX', focal.x),
    y: storyStyleNumber(element, 'focalY', focal.y),
  });
  const fontFamily = $derived(
    (
      {
        inter: "'GoogleSans', Arial, sans-serif",
        'libre-baskerville': "Georgia, 'Times New Roman', serif",
        'source-sans-3': "'GoogleSans', Arial, sans-serif",
      } as Record<string, string>
    )[storyStyleString(element, 'font', 'inter')] ?? "'GoogleSans', Arial, sans-serif",
  );
  const playback = $derived(element.videoPlayback ?? { mode: 'click' as const, delayMs: 0 });

  $effect(() => {
    if (element.type !== 'video' || !video) return;
    const triggered = isStoryVideoTriggered(
      playback.mode === 'delayed' ? 'delay' : playback.mode,
      playback.delayMs,
      pageTime,
    );
    if (triggered && !lastTriggered) {
      video.muted = true;
      video.currentTime = 0;
      void video.play().catch(() => (autoplayBlocked = true));
    } else if (!triggered && lastTriggered) {
      video.pause();
      video.currentTime = 0;
    }
    lastTriggered = triggered;
  });

  const playVideo = async () => {
    if (!video) return;
    video.muted = playback.mode !== 'click';
    try {
      await video.play();
      autoplayBlocked = false;
    } catch {
      autoplayBlocked = true;
    }
  };
</script>

<div
  class="absolute top-0 left-0 origin-center overflow-visible"
  data-story-element={element.id}
  aria-hidden={element.type === 'video' ? undefined : 'true'}
  style:width={`${element.frame.width}px`}
  style:height={`${element.frame.height}px`}
  style:transform={`${storyElementTransform(element.frame, element.rotation)} ${animation.transform}`}
  style:opacity={storyStyleNumber(element, 'opacity', 1) * animation.opacity}
>
  <div
    class="relative size-full overflow-hidden"
    style:border-width={`${border?.width ?? 0}px`}
    style:border-style={border?.style ?? 'solid'}
    style:border-color={border?.color ?? 'transparent'}
    style:border-radius={`${storyStyleNumber(element, 'cornerRadius', 0)}px`}
  >
    {#if element.type === 'image'}
      {#if source?.imageUrl}<img
          class="size-full"
          src={source.imageUrl}
          alt=""
          draggable="false"
          style:object-fit={storyStyleString(element, 'fit', 'cover')}
          style:object-position={`${focalPosition.x * 100}% ${focalPosition.y * 100}%`}
        />{:else}<div class="flex size-full items-center justify-center bg-gray-200 text-gray-600" data-story-missing>
          Missing image
        </div>{/if}
    {:else if element.type === 'video'}
      {#if source?.videoUrl || source?.posterUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          id={`story-video-${element.id}`}
          class="size-full object-contain"
          src={source.videoUrl}
          poster={source.posterUrl}
          preload="metadata"
          playsinline
        ></video>
        {#if playback.mode === 'click' || autoplayBlocked}<button
            class="absolute inset-0 m-auto size-16 rounded-full bg-black/70 text-2xl text-white"
            type="button"
            aria-label={`Play ${getStoryElementLabel(element)}`}
            onclick={playVideo}>▶</button
          >{/if}
      {:else}<div class="flex size-full items-center justify-center bg-gray-200 text-gray-600" data-story-missing>
          Missing video
        </div>{/if}
    {:else if element.type === 'text'}
      <div
        class="size-full overflow-hidden whitespace-pre-wrap break-words"
        style:font-family={fontFamily}
        style:font-size={`${storyStyleNumber(element, 'size', 36)}px`}
        style:line-height={`${storyStyleNumber(element, 'lineHeight', 44)}px`}
        style:letter-spacing={`${storyStyleNumber(element, 'letterSpacing', 0)}px`}
        style:font-weight={storyStyleNumber(element, 'weight', 400)}
        style:text-align={storyStyleString(element, 'alignment', 'left')}
        style:color={storyStyleString(element, 'color', '#111111')}
      >
        {element.text ?? ''}
      </div>
    {:else if element.type === 'shape'}
      {#if storyStyleString(element, 'shape', 'rectangle') === 'line'}<div
          class="absolute top-1/2 w-full"
          style:border-top={`1px solid ${storyStyleString(element, 'fill', '#000000')}`}
        ></div>{:else}<div
          class:rounded-full={storyStyleString(element, 'shape', 'rectangle') === 'ellipse'}
          class="size-full"
          style:background={storyStyleString(element, 'fill', '#000000')}
        ></div>{/if}
    {:else if element.type === 'sticker'}
      {@const token = storyStyleString(element, 'stickerToken', '')}{@const url = token
        ? stickerResolver?.(token)
        : source?.imageUrl}
      {#if url}<img
          class="size-full object-contain"
          src={url}
          alt=""
          draggable="false"
        />{:else if token.startsWith('builtin:')}<div
          class="flex size-full items-center justify-center text-[min(15vw,10rem)] leading-none"
          aria-hidden="true"
        >
          {{ 'builtin:heart': '♥', 'builtin:star': '★', 'builtin:sparkles': '✨', 'builtin:speech-bubble': '💬' }[
            token
          ] ?? '★'}
        </div>{:else}<div
          class="flex size-full items-center justify-center bg-gray-200 text-gray-600"
          data-story-missing
        >
          Missing sticker
        </div>{/if}
    {/if}
  </div>
</div>
