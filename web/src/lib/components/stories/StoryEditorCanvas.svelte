<script lang="ts">
  import { getStoryViewportMetrics, normalizeStoryRotation } from '$lib/utils/story-geometry';
  import { StoryGestureController, type StoryGestureResult } from '$lib/utils/story-gesture';
  import {
    getStoryElementName,
    storyStyleNumber,
    storyStylePoint,
    storyStyleString,
    type StoryAspectRatio,
    type StoryElement,
    type StoryFrame,
    type StoryMediaResolver,
    type StoryScene,
  } from '$lib/utils/story-model';
  import {
    StorySerializedCommandQueue,
    type StoryCommand,
    type StoryCommandBatch,
    type StoryEditorTransactionManager,
  } from '$lib/utils/story-editor-state';
  import StoryAuthoringOverlay from './StoryAuthoringOverlay.svelte';
  import StoryObjectList from './StoryObjectList.svelte';
  import StoryPage from './StoryPage.svelte';

  type Props = {
    scene: StoryScene;
    aspectRatio: StoryAspectRatio;
    transactionManager: StoryEditorTransactionManager<unknown, { frame: StoryFrame; rotation: number }>;
    onBatch?: (batch: StoryCommandBatch) => Promise<void>;
    mediaResolver?: StoryMediaResolver;
  };

  let { scene, aspectRatio, transactionManager, onBatch, mediaResolver }: Props = $props();
  let selectedId = $state<string>();
  let preview = $state<{ frame: StoryFrame; rotation: number }>();
  let width = $state(0);
  let height = $state(0);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let snap = $state(true);
  let liveMessage = $state('');
  let pendingSaves = $state(0);
  let sending = $derived(pendingSaves > 0);
  let saveError = $state<string>();
  const commandQueue = new StorySerializedCommandQueue(transactionManager);
  const gesture = new StoryGestureController();
  const metrics = $derived(getStoryViewportMetrics(aspectRatio, width, height, zoom));
  const selected = $derived(scene.elements.find(({ id }) => id === selectedId));
  const displayedSelected = $derived(selected && preview ? { ...selected, ...preview } : selected);

  const send = async (batch: StoryCommandBatch) => {
    await onBatch?.(batch);
  };
  const trackSave = async (operation: Promise<void>) => {
    pendingSaves++;
    saveError = undefined;
    try {
      await operation;
      return true;
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Unable to save changes';
      liveMessage = 'Changes were not saved. Retry the save before continuing.';
    } finally {
      pendingSaves--;
    }
    return false;
  };
  const emit = (commands: StoryCommand[], inverse: StoryCommand[]) =>
    trackSave(
      commandQueue.enqueue({
        kind: 'control',
        preview: { frame: selected?.frame ?? { x: 0, y: 0, width: 1, height: 1 }, rotation: selected?.rotation ?? 0 },
        commands,
        inverseCommands: inverse,
        send,
      }),
    );
  const retrySave = () => trackSave(commandQueue.retryFailed());

  const patchCommand = (element: StoryElement, patch: Record<string, unknown>): StoryCommand => {
    if ('frame' in patch || 'rotation' in patch)
      return {
        op: 'element.patchGeometry',
        sceneId: scene.id,
        elementId: element.id,
        frame: patch.frame ?? element.frame,
        rotation: patch.rotation ?? element.rotation,
      };
    if ('text' in patch)
      return { op: 'element.setText', sceneId: scene.id, elementId: element.id, text: patch.text ?? '' };
    if ('ariaHidden' in patch || 'altText' in patch)
      return {
        op: 'element.setAccessibility',
        sceneId: scene.id,
        elementId: element.id,
        ariaHidden: patch.ariaHidden ?? element.ariaHidden,
        altText: patch.altText ?? element.altText ?? '',
      };
    if ('style' in patch)
      return { op: 'element.setTextStyle', sceneId: scene.id, elementId: element.id, style: patch.style ?? {} };
    if ('border' in patch)
      return { op: 'element.setBorder', sceneId: scene.id, elementId: element.id, border: patch.border ?? null };
    if ('animation' in patch)
      return {
        op: 'element.setAnimation',
        sceneId: scene.id,
        elementId: element.id,
        animation: patch.animation ?? null,
      };
    if ('videoPlayback' in patch) {
      const playback = patch.videoPlayback as StoryElement['videoPlayback'];
      return {
        op: 'element.setVideoPlayback',
        sceneId: scene.id,
        elementId: element.id,
        mode: playback?.mode ?? 'click',
        delayMs: playback?.delayMs ?? 0,
      };
    }
    throw new Error('Unsupported story element patch');
  };

  const patchElement = async (element: StoryElement, patch: Record<string, unknown>) => {
    const inverse: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) inverse[key] = element[key as keyof StoryElement];
    await emit([patchCommand(element, patch)], [patchCommand(element, inverse)]);
    liveMessage = `${getStoryElementName(element)} updated`;
  };

  const handleGesture = async (result: StoryGestureResult | undefined) => {
    if (!result) return;
    if (result.type === 'preview') {
      preview = { frame: result.frame, rotation: result.rotation };
      transactionManager.update(preview);
    } else if (result.type === 'cancel') {
      preview = undefined;
      transactionManager.cancel();
      liveMessage = 'Change canceled';
    } else if (result.type === 'commit' && selected) {
      preview = undefined;
      const saved = await trackSave(
        commandQueue.commitActive({
          commands: [
            {
              op: 'element.patchGeometry',
              sceneId: scene.id,
              elementId: selected.id,
              frame: result.frame,
              rotation: result.rotation,
            },
          ],
          inverseCommands: [
            {
              op: 'element.patchGeometry',
              sceneId: scene.id,
              elementId: selected.id,
              frame: selected.frame,
              rotation: selected.rotation,
            },
          ],
          send,
        }),
      );
      if (saved) liveMessage = `${getStoryElementName(selected)} moved`;
    } else if (result.type === 'viewport') {
      panX += result.panX;
      panY += result.panY;
      zoom = Math.min(8, Math.max(0.25, zoom * result.zoomFactor));
    }
  };

  const onPointerDown = (event: PointerEvent, operation: 'move' | 'resize' | 'rotate') => {
    if (!selected || sending || saveError || event.button !== 0) return;
    event.currentTarget instanceof Element && event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
    if (gesture.mode === 'idle') {
      transactionManager.begin(operation, { frame: selected.frame, rotation: selected.rotation });
      gesture.beginElement(event.pointerId, point, selected.frame, selected.rotation, operation);
    } else {
      void handleGesture(gesture.addPointer(event.pointerId, point));
    }
  };

  const onPointerMove = (event: PointerEvent) =>
    void handleGesture(
      gesture.move(event.pointerId, { x: event.clientX, y: event.clientY }, { scale: metrics.scale, snap }),
    );
  const onPointerEnd = (event: PointerEvent) => void handleGesture(gesture.end(event.pointerId));
  const cancelGesture = () => void handleGesture(gesture.cancel());

  const nudge = async (dx: number, dy: number) => {
    if (!selected) return;
    await patchElement(selected, { frame: { ...selected.frame, x: selected.frame.x + dx, y: selected.frame.y + dy } });
  };

  const removeElement = (element: StoryElement) => {
    const inverse: StoryCommand[] = [{ op: 'element.add', sceneId: scene.id, element }];
    if (!element.ariaHidden)
      inverse.push({ op: 'scene.setReadingOrder', sceneId: scene.id, elementIds: scene.readingOrder });
    return emit([{ op: 'element.remove', sceneId: scene.id, elementId: element.id }], inverse);
  };

  const onKeydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).matches('input, textarea, select, button')) return;
    const amount = event.shiftKey ? 10 : 1;
    if (event.key === 'Escape') cancelGesture();
    else if (event.key === 'ArrowLeft') void nudge(-amount, 0);
    else if (event.key === 'ArrowRight') void nudge(amount, 0);
    else if (event.key === 'ArrowUp') void nudge(0, -amount);
    else if (event.key === 'ArrowDown') void nudge(0, amount);
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      void removeElement(selected);
    } else return;
    event.preventDefault();
  };

  const addElement = (type: 'text' | 'shape' | 'sticker', stickerToken?: string) => {
    const id = crypto.randomUUID();
    const base = {
      id,
      frame: { x: 100, y: 100, width: 300, height: 120 },
      rotation: 0,
      ariaHidden: type !== 'text',
    };
    const element =
      type === 'text'
        ? {
            ...base,
            type,
            text: 'New text',
            style: {
              font: 'inter',
              size: 36,
              lineHeight: 44,
              letterSpacing: 0,
              weight: 400,
              alignment: 'left',
              color: '#111111',
            },
          }
        : type === 'sticker'
          ? {
              ...base,
              type,
              frame: { x: 250, y: 250, width: 240, height: 240 },
              style: { stickerToken: stickerToken ?? 'builtin:heart', opacity: 1 },
            }
          : { ...base, type, style: { shape: 'rectangle', fill: '#DDE4FF' } };
    const commands: StoryCommand[] = [{ op: 'element.add', sceneId: scene.id, element }];
    if (type === 'text')
      commands.push({ op: 'scene.setReadingOrder', sceneId: scene.id, elementIds: [...scene.readingOrder, id] });
    void emit(commands, [{ op: 'element.remove', sceneId: scene.id, elementId: id }]);
  };

  const moveLayer = (id: string, direction: 'forward' | 'backward' | 'front' | 'back') => {
    const items = scene.elements;
    const index = items.findIndex((item) => item.id === id);
    const others = items.filter((item) => item.id !== id);
    let afterElementId: string | null = null;
    if (direction === 'front') afterElementId = others.at(-1)?.id ?? null;
    else if (direction === 'forward') afterElementId = items[index + 1]?.id ?? others.at(-1)?.id ?? null;
    else if (direction === 'backward') afterElementId = index > 1 ? items[index - 2].id : null;
    const previousAfterId = index > 0 ? items[index - 1].id : null;
    void emit(
      [{ op: 'element.moveLayer', sceneId: scene.id, elementId: id, afterElementId }],
      [{ op: 'element.moveLayer', sceneId: scene.id, elementId: id, afterElementId: previousAfterId }],
    );
  };
  const setSceneDuration = (durationMs: number) =>
    emit(
      [{ op: 'scene.setTiming', sceneId: scene.id, durationMs }],
      [{ op: 'scene.setTiming', sceneId: scene.id, durationMs: scene.durationMs }],
    );
  const undo = async () => {
    const batch = await transactionManager.undo();
    await trackSave(commandQueue.sendCommitted(batch, send));
    if (batch) liveMessage = 'Last change undone';
  };
  const redo = async () => {
    const batch = await transactionManager.redo();
    await trackSave(commandQueue.sendCommitted(batch, send));
    if (batch) liveMessage = 'Change redone';
  };
</script>

<section class="grid min-h-0 min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Story editor">
  <div class="flex min-h-0 min-w-0 flex-col gap-2">
    <div class="flex flex-wrap gap-2" aria-label="Story editor controls">
      <button class="min-h-11" type="button" onclick={() => addElement('text')}>Add text</button>
      <button class="min-h-11" type="button" onclick={() => addElement('shape')}>Add shape</button>
      <label class="min-h-11"
        >Add sticker
        <select
          aria-label="Built-in sticker"
          onchange={(event) => {
            if (event.currentTarget.value) addElement('sticker', event.currentTarget.value);
            event.currentTarget.value = '';
          }}
          ><option value="">Choose…</option><option value="builtin:heart">Heart</option><option value="builtin:star"
            >Star</option
          ><option value="builtin:sparkles">Sparkles</option><option value="builtin:speech-bubble">Speech bubble</option
          ></select
        ></label
      >
      <button class="min-h-11" type="button" disabled={sending} onclick={undo}>Undo</button>
      <button class="min-h-11" type="button" disabled={sending} onclick={redo}>Redo</button>
      <button class="min-h-11" type="button" aria-pressed={snap} onclick={() => (snap = !snap)}>Snap</button>
      <button
        type="button"
        onclick={() => {
          zoom = 1;
          panX = 0;
          panY = 0;
        }}>Fit</button
      >
      <label>Zoom <input type="range" min="0.25" max="4" step="0.05" bind:value={zoom} /></label>
      <label
        >Page duration (seconds)
        <input
          class="w-24"
          type="number"
          min="1"
          max="60"
          step="0.1"
          value={scene.durationMs / 1000}
          onchange={(event) => void setSceneDuration(Math.round(event.currentTarget.valueAsNumber * 1000))}
        /></label
      >
    </div>

    {#if saveError}
      <div class="flex items-center justify-between gap-3 rounded-lg border border-red-500 p-3" role="alert">
        <span>Changes are saved locally but could not reach the server: {saveError}</span>
        <button type="button" disabled={sending} onclick={retrySave}>Retry save</button>
      </div>
    {/if}

    <!-- The canvas is an intentional custom interaction surface; all operations also exist in the adjacent semantic controls. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="relative min-h-80 flex-1 overflow-hidden bg-gray-100 outline-none touch-none"
      role="application"
      aria-label="Story canvas. Use the Objects panel for a fully accessible editing view."
      tabindex="0"
      bind:clientWidth={width}
      bind:clientHeight={height}
      onkeydown={onKeydown}
      onpointermove={onPointerMove}
      onpointerup={onPointerEnd}
      onpointercancel={cancelGesture}
      onlostpointercapture={cancelGesture}
    >
      {#if width && height}
        <div
          class="absolute origin-top-left"
          style:left={`${metrics.offsetX + panX}px`}
          style:top={`${metrics.offsetY + panY}px`}
          style:transform={`scale(${metrics.scale})`}
        >
          <StoryPage {scene} {aspectRatio} {mediaResolver} />
          <StoryAuthoringOverlay {aspectRatio} selected={displayedSelected} />
          {#if displayedSelected}
            <button
              type="button"
              class="absolute cursor-move bg-transparent"
              aria-label={`Move ${getStoryElementName(displayedSelected)}`}
              style:left={`${displayedSelected.frame.x}px`}
              style:top={`${displayedSelected.frame.y}px`}
              style:width={`${displayedSelected.frame.width}px`}
              style:height={`${displayedSelected.frame.height}px`}
              onpointerdown={(event) => onPointerDown(event, 'move')}
            ></button>
            <button
              type="button"
              class="absolute size-11"
              aria-label={`Resize ${getStoryElementName(displayedSelected)}`}
              style:left={`${displayedSelected.frame.x + displayedSelected.frame.width - 22}px`}
              style:top={`${displayedSelected.frame.y + displayedSelected.frame.height - 22}px`}
              onpointerdown={(event) => onPointerDown(event, 'resize')}
            ></button>
            <button
              type="button"
              class="absolute size-11"
              aria-label={`Rotate ${getStoryElementName(displayedSelected)}`}
              style:left={`${displayedSelected.frame.x + displayedSelected.frame.width / 2 - 22}px`}
              style:top={`${displayedSelected.frame.y - 56}px`}
              onpointerdown={(event) => onPointerDown(event, 'rotate')}
            ></button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <aside class="min-w-0 max-h-full overflow-auto">
    <StoryObjectList
      {scene}
      {selectedId}
      onSelect={(id) => (selectedId = id)}
      onPatch={(id, patch) => {
        const element = scene.elements.find((item) => item.id === id);
        if (element) void patchElement(element, patch);
      }}
      onDelete={(id) => {
        const element = scene.elements.find((item) => item.id === id);
        if (element) void removeElement(element);
      }}
      onMove={moveLayer}
    />

    {#if selected}
      <section class="mt-4 flex flex-col gap-2" aria-label={`Properties for ${getStoryElementName(selected)}`}>
        {#if selected.type === 'text'}
          <label
            >Text <textarea
              value={selected.text}
              onblur={(event) => void patchElement(selected, { text: event.currentTarget.value })}></textarea></label
          >
          <label
            >Text color <input
              type="color"
              value={storyStyleString(selected, 'color', '#111111')}
              oninput={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, color: event.currentTarget.value.toUpperCase() },
                })}
            /></label
          >
          <label
            >Font
            <select
              value={storyStyleString(selected, 'font', 'inter')}
              onchange={(event) =>
                void patchElement(selected, { style: { ...selected.style, font: event.currentTarget.value } })}
              ><option value="inter">Inter</option><option value="libre-baskerville">Libre Baskerville</option><option
                value="source-sans-3">Source Sans 3</option
              ></select
            ></label
          >
          <label
            >Size
            <input
              type="number"
              min="8"
              max="300"
              step="1"
              value={storyStyleNumber(selected, 'size', 36)}
              onchange={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, size: event.currentTarget.valueAsNumber },
                })}
            /></label
          >
          <label
            >Weight
            <select
              value={storyStyleNumber(selected, 'weight', 400)}
              onchange={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, weight: Number(event.currentTarget.value) },
                })}
              ><option value="300">Light</option><option value="400">Regular</option><option value="600"
                >Semi-bold</option
              ><option value="700">Bold</option></select
            ></label
          >
          <label
            >Alignment
            <select
              value={storyStyleString(selected, 'alignment', 'left')}
              onchange={(event) =>
                void patchElement(selected, { style: { ...selected.style, alignment: event.currentTarget.value } })}
              ><option value="left">Left</option><option value="center">Center</option><option value="right"
                >Right</option
              ></select
            ></label
          >
        {:else if selected.type === 'image'}
          <label
            >Crop treatment
            <select
              value={storyStyleString(selected, 'fit', 'cover')}
              onchange={(event) =>
                void patchElement(selected, { style: { ...selected.style, fit: event.currentTarget.value } })}
              ><option value="cover">Fill and crop</option><option value="contain">Fit whole image</option></select
            ></label
          >
          <label
            >Image opacity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={storyStyleNumber(selected, 'opacity', 1)}
              onchange={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, opacity: event.currentTarget.valueAsNumber },
                })}
            /></label
          >
          <label
            >Focal point horizontal
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={storyStyleNumber(selected, 'focalX', 0.5)}
              onchange={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, focalX: event.currentTarget.valueAsNumber },
                })}
            /></label
          >
          <label
            >Focal point vertical
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={storyStyleNumber(selected, 'focalY', 0.5)}
              onchange={(event) =>
                void patchElement(selected, {
                  style: { ...selected.style, focalY: event.currentTarget.valueAsNumber },
                })}
            /></label
          >
        {:else if selected.type === 'video'}
          <label
            >Playback <select
              value={selected.videoPlayback?.mode ?? 'click'}
              onchange={(event) =>
                void patchElement(selected, {
                  videoPlayback: { mode: event.currentTarget.value, delayMs: selected.videoPlayback?.delayMs ?? 0 },
                })}
              ><option value="click">Click to play</option><option value="autoplay">Autoplay</option><option
                value="delayed">After a delay</option
              ></select
            ></label
          >
          {#if selected.videoPlayback?.mode === 'delayed'}<label
              >Delay (seconds) <input
                type="number"
                min="0"
                max="60"
                step="0.1"
                value={(selected.videoPlayback.delayMs ?? 0) / 1000}
                onchange={(event) =>
                  void patchElement(selected, {
                    videoPlayback: { ...selected.videoPlayback, delayMs: event.currentTarget.valueAsNumber * 1000 },
                  })}
              /></label
            >{/if}
        {/if}
        {#if selected.type === 'image' || selected.type === 'video' || selected.type === 'sticker'}
          <fieldset class="grid grid-cols-2 gap-2 rounded-lg border p-2">
            <legend>Border</legend>
            <label
              >Width
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={selected.border?.width ?? 0}
                onchange={(event) =>
                  void patchElement(selected, {
                    border: {
                      width: event.currentTarget.valueAsNumber,
                      style: selected.border?.style ?? 'solid',
                      color: selected.border?.color ?? '#000000',
                      opacity: selected.border?.opacity ?? 1,
                    },
                  })}
              /></label
            ><label
              >Style
              <select
                value={selected.border?.style ?? 'solid'}
                onchange={(event) =>
                  void patchElement(selected, {
                    border: {
                      width: selected.border?.width ?? 1,
                      style: event.currentTarget.value,
                      color: selected.border?.color ?? '#000000',
                      opacity: selected.border?.opacity ?? 1,
                    },
                  })}
                ><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="double"
                  >Double</option
                ></select
              ></label
            ><label
              >Color
              <input
                type="color"
                value={selected.border?.color ?? '#000000'}
                onchange={(event) =>
                  void patchElement(selected, {
                    border: {
                      width: selected.border?.width ?? 1,
                      style: selected.border?.style ?? 'solid',
                      color: event.currentTarget.value.toUpperCase(),
                      opacity: selected.border?.opacity ?? 1,
                    },
                  })}
              /></label
            ><label
              >Opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selected.border?.opacity ?? 1}
                onchange={(event) =>
                  void patchElement(selected, {
                    border: {
                      width: selected.border?.width ?? 1,
                      style: selected.border?.style ?? 'solid',
                      color: selected.border?.color ?? '#000000',
                      opacity: event.currentTarget.valueAsNumber,
                    },
                  })}
              /></label
            >
          </fieldset>
        {/if}
        {#if selected.type !== 'video'}<label
            >Animation <select
              value={selected.animation?.preset ?? ''}
              onchange={(event) =>
                void patchElement(selected, {
                  animation: event.currentTarget.value
                    ? {
                        preset: event.currentTarget.value,
                        startMs: selected.animation?.startMs ?? 0,
                        durationMs: selected.animation?.durationMs ?? 500,
                        easing: 'ease',
                        reducedMotion: 'fade',
                      }
                    : undefined,
                })}
              ><option value="">None</option><option value="fade">Fade</option><option value="rise">Rise</option><option
                value="slide">Slide</option
              ><option value="scale">Scale</option></select
            ></label
          >
          {#if selected.animation}
            <label
              >Animation start (seconds)
              <input
                type="number"
                min="0"
                max={scene.durationMs / 1000}
                step="0.1"
                value={selected.animation.startMs / 1000}
                onchange={(event) =>
                  void patchElement(selected, {
                    animation: {
                      ...selected.animation!,
                      startMs: Math.round(event.currentTarget.valueAsNumber * 1000),
                    },
                  })}
              /></label
            ><label
              >Animation duration (seconds)
              <input
                type="number"
                min="0.1"
                max={(scene.durationMs - selected.animation.startMs) / 1000}
                step="0.1"
                value={selected.animation.durationMs / 1000}
                onchange={(event) =>
                  void patchElement(selected, {
                    animation: {
                      ...selected.animation!,
                      durationMs: Math.round(event.currentTarget.valueAsNumber * 1000),
                    },
                  })}
              /></label
            ><label
              >Easing
              <select
                value={selected.animation.easing}
                onchange={(event) =>
                  void patchElement(selected, {
                    animation: { ...selected.animation!, easing: event.currentTarget.value },
                  })}
                ><option value="linear">Linear</option><option value="ease">Ease</option><option value="ease_in"
                  >Ease in</option
                ><option value="ease_out">Ease out</option><option value="ease_in_out">Ease in/out</option></select
              ></label
            ><label
              >Reduced motion
              <select
                value={selected.animation.reducedMotion}
                onchange={(event) =>
                  void patchElement(selected, {
                    animation: { ...selected.animation!, reducedMotion: event.currentTarget.value },
                  })}
                ><option value="omit">Omit</option><option value="fade">Fade</option><option value="instant"
                  >Instant</option
                ></select
              ></label
            >
          {/if}
        {/if}
        <label class="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={selected.ariaHidden}
            onchange={(event) => void patchElement(selected, { ariaHidden: event.currentTarget.checked })}
          /> Decorative (hide from reading order)
        </label>
        {#if !selected.ariaHidden}<label
            >Alt text or accessible label
            <textarea
              value={selected.altText ?? ''}
              onblur={(event) => void patchElement(selected, { altText: event.currentTarget.value })}></textarea>
          </label>{/if}
        <label
          >Rotation <input
            type="number"
            min="-180"
            max="179.999"
            step="1"
            value={selected.rotation}
            onchange={(event) =>
              void patchElement(selected, { rotation: normalizeStoryRotation(event.currentTarget.valueAsNumber) })}
          /></label
        >
      </section>
    {/if}
  </aside>
  <p class="sr-only" aria-live="polite">{liveMessage}</p>
</section>
