<script lang="ts">
  import {
    getStoryElementLabel,
    getStoryElementName,
    type StoryElement,
    type StoryFrame,
    type StoryScene,
  } from '$lib/utils/story-model';

  type Props = {
    scene: StoryScene;
    selectedId?: string;
    onSelect?: (id: string) => void;
    onPatch?: (id: string, patch: Partial<StoryElement>) => void;
    onDelete?: (id: string) => void;
    onMove?: (id: string, direction: 'forward' | 'backward' | 'front' | 'back') => void;
  };
  let { scene, selectedId, onSelect, onPatch, onDelete, onMove }: Props = $props();

  const patchFrame = (element: StoryElement, key: keyof StoryFrame, value: number) =>
    onPatch?.(element.id, { frame: { ...element.frame, [key]: value } } as Partial<StoryElement>);
</script>

<section aria-label="Story objects" class="flex flex-col gap-2" data-story-object-list>
  <h2 class="text-lg font-semibold">Objects</h2>
  <ol class="flex flex-col gap-2">
    {#each [...scene.elements].reverse() as element (element.id)}
      <li class="rounded-lg border p-2" data-story-object={element.id}>
        <button
          type="button"
          class="w-full rounded-sm p-2 text-left focus-visible:outline-2"
          aria-pressed={selectedId === element.id}
          onclick={() => onSelect?.(element.id)}
        >
          <span class="font-medium">{getStoryElementName(element)}</span>
          <span class="ml-2 text-sm text-gray-500">{element.type}</span>
        </button>

        {#if selectedId === element.id}
          <fieldset class="mt-2 grid grid-cols-2 gap-2">
            <legend class="sr-only">Edit {getStoryElementLabel(element)}</legend>
            {#each ['x', 'y', 'width', 'height'] as key}
              <label class="text-sm">
                {key}
                <input
                  class="immich-form-input w-full"
                  type="number"
                  min={key === 'width' || key === 'height' ? 0.001 : undefined}
                  step="0.001"
                  value={element.frame[key as keyof StoryFrame]}
                  onchange={(event) => patchFrame(element, key as keyof StoryFrame, event.currentTarget.valueAsNumber)}
                />
              </label>
            {/each}
            <label class="text-sm">
              Rotation
              <input
                class="immich-form-input w-full"
                type="number"
                min="-180"
                max="179.999"
                step="0.001"
                value={element.rotation}
                onchange={(event) => onPatch?.(element.id, { rotation: event.currentTarget.valueAsNumber })}
              />
            </label>
          </fieldset>

          <div class="mt-2 flex flex-wrap gap-2" aria-label={`Actions for ${getStoryElementName(element)}`}>
            <button type="button" onclick={() => onMove?.(element.id, 'front')}>Bring to front</button>
            <button type="button" onclick={() => onMove?.(element.id, 'forward')}>Bring forward</button>
            <button type="button" onclick={() => onMove?.(element.id, 'backward')}>Send backward</button>
            <button type="button" onclick={() => onMove?.(element.id, 'back')}>Send to back</button>
            <button type="button" onclick={() => onDelete?.(element.id)}>Delete</button>
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</section>
