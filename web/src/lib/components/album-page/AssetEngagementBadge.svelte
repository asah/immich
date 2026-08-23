<script lang="ts">
  import { reactionEmoji } from '$lib/utils/reaction-emoji';
  import { mdiCommentOutline } from '@mdi/js';
  import { Icon } from '@immich/ui';

  type Props = {
    reactions: Record<string, number>;
    comments: number;
  };

  let { reactions, comments }: Props = $props();
  const entries = $derived(Object.entries(reactions));
</script>

{#if entries.length || comments}
  <div
    class="pointer-events-none absolute right-1 bottom-1 flex max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-xs text-white shadow-sm"
    aria-label={`${entries.reduce((total, [, count]) => total + count, 0)} reactions and ${comments} comments`}
  >
    {#each entries as [key, count] (key)}
      <span title={`${count} ${key} reaction${count === 1 ? '' : 's'}`}>{reactionEmoji[key] ?? '😀'} {count}</span>
    {/each}
    {#if comments}
      <span class="flex items-center gap-0.5" title={`${comments} comment${comments === 1 ? '' : 's'}`}>
        <Icon icon={mdiCommentOutline} size="12" />
        {comments}
      </span>
    {/if}
  </div>
{/if}
