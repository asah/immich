<script lang="ts">
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { reactionEmoji } from '$lib/utils/reaction-emoji';
  import type { ActivityResponseDto } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { mdiCommentOutline } from '@mdi/js';
  import ReactionPicker from './ReactionPicker.svelte';

  interface Props {
    isLiked: ActivityResponseDto | null;
    numberOfComments: number | undefined;
    numberOfLikes: number | undefined;
    disabled: boolean;
    onFavorite: () => void;
    onReaction?: (reactionKey: string) => void;
    onComments?: () => void;
    allowAddingReactions?: boolean;
  }

  let {
    isLiked,
    numberOfComments,
    numberOfLikes,
    disabled,
    onFavorite,
    onReaction,
    onComments,
    allowAddingReactions = true,
  }: Props = $props();
  const reactionCounts = $derived(
    activityManager.activities
      .filter(({ type, parentActivityId }) => type === 'like' && !parentActivityId)
      .reduce<Record<string, number>>((counts, { reactionKey }) => {
        const key = reactionKey ?? 'like';
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
  );
</script>

<div class="flex items-center justify-center gap-1 rounded-full border bg-subtle/70 p-1">
  {#each Object.entries(reactionCounts) as [key, count] (key)}
    <button
      type="button"
      class="flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-sm transition hover:border-primary hover:bg-primary/10"
      class:border-primary={isLiked?.reactionKey === key}
      class:bg-primary={isLiked?.reactionKey === key}
      aria-label={`${reactionEmoji[key] ?? '😀'} ${count} reaction${count === 1 ? '' : 's'}`}
      title={`${count} ${key} reaction${count === 1 ? '' : 's'}`}
      onclick={() => onReaction?.(key)}
    >
      <span class="text-lg">{reactionEmoji[key] ?? '😀'}</span>
      <span>{count}</span>
    </button>
  {/each}
  {#if onReaction && allowAddingReactions}
    <div class:opacity-50={disabled} class:pointer-events-none={disabled}>
      <ReactionPicker count={0} selectedEmoji="＋" onSelect={({ key }) => onReaction?.(key)} />
    </div>
  {:else}
    <Button
      {disabled}
      onclick={onFavorite}
      aria-label="Like"
      shape="round"
      size="large"
      variant="ghost"
      class="p-3 text-base"
    >
      😀
    </Button>
  {/if}
  <Button
    onclick={() => onComments?.() ?? assetViewerManager.toggleActivityPanel()}
    aria-label={onComments ? 'Show photos with comments' : 'Open activity'}
    leadingIcon={mdiCommentOutline}
    shape="round"
    size="large"
    variant="ghost"
    color="secondary"
    class="p-3 text-base"
  >
    {#if numberOfComments}
      {numberOfComments.toLocaleString($locale)}
    {/if}
  </Button>
</div>
