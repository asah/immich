<script lang="ts">
  import { STORY_PAGE_SIZES, type StoryAspectRatio, type StoryElement } from '$lib/utils/story-model';

  type Props = {
    aspectRatio: StoryAspectRatio;
    selected?: StoryElement;
  };

  let { aspectRatio, selected }: Props = $props();
  const size = $derived(STORY_PAGE_SIZES[aspectRatio]);
  const corners = $derived(
    selected
      ? [
          [selected.frame.x, selected.frame.y],
          [selected.frame.x + selected.frame.width, selected.frame.y],
          [selected.frame.x + selected.frame.width, selected.frame.y + selected.frame.height],
          [selected.frame.x, selected.frame.y + selected.frame.height],
        ]
      : [],
  );
</script>

<svg
  class="pointer-events-none absolute inset-0 size-full overflow-visible"
  viewBox={`0 0 ${size.width} ${size.height}`}
  aria-hidden="true"
  data-story-authoring-overlay
>
  {#if selected}
    <g
      transform={`rotate(${selected.rotation} ${selected.frame.x + selected.frame.width / 2} ${selected.frame.y + selected.frame.height / 2})`}
    >
      <rect
        x={selected.frame.x}
        y={selected.frame.y}
        width={selected.frame.width}
        height={selected.frame.height}
        fill="none"
        stroke="var(--color-primary, #4250af)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      {#each corners as corner}
        <circle
          cx={corner[0]}
          cy={corner[1]}
          r="7"
          fill="white"
          stroke="var(--color-primary, #4250af)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      <line
        x1={selected.frame.x + selected.frame.width / 2}
        y1={selected.frame.y}
        x2={selected.frame.x + selected.frame.width / 2}
        y2={selected.frame.y - 28}
        stroke="var(--color-primary, #4250af)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx={selected.frame.x + selected.frame.width / 2}
        cy={selected.frame.y - 34}
        r="7"
        fill="white"
        stroke="var(--color-primary, #4250af)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
    </g>
  {/if}
</svg>
