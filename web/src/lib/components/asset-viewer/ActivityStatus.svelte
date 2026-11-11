<script lang="ts">
  import type { ActivityResponseDto } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { mdiCommentOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { reactionEmoji } from '$lib/utils/reaction-emoji';
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
    activeReactionKey?: string;
    activeComments?: boolean;
    /** Ignore the current user's reaction when this bar is being used as a filter. */
    filterMode?: boolean;
    favoriteReactionKey?: string;
  }

  let {
    isLiked,
    numberOfComments,
    numberOfLikes: _,
    disabled,
    onFavorite,
    onReaction,
    onComments,
    allowAddingReactions = true,
    activeReactionKey,
    activeComments = false,
    filterMode = false,
    favoriteReactionKey,
  }: Props = $props();
  const reactionCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const { reactionKey, type, parentActivityId, assetId } of activityManager.activities) {
      // Album-level reactions must not create photo filters with no results.
      if (type !== 'like' || parentActivityId || (filterMode && !assetId)) {
        continue;
      }
      const key = reactionKey ?? 'like';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  });
</script>

<div class="flex items-center justify-center gap-1 rounded-full border bg-subtle/70 p-1">
  {#if favoriteReactionKey}
    <button
      type="button"
      class="flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-sm transition hover:border-primary hover:bg-primary/10"
      class:border-primary={isLiked?.reactionKey === favoriteReactionKey}
      class:bg-primary={isLiked?.reactionKey === favoriteReactionKey}
      aria-label={isLiked?.reactionKey === favoriteReactionKey ? $t('unfavorite') : $t('favorite')}
      title={isLiked?.reactionKey === favoriteReactionKey ? $t('unfavorite') : $t('favorite')}
      onclick={onFavorite}
      {disabled}
    >
      <span class="text-lg">❤️</span>
      {#if reactionCounts[favoriteReactionKey]}
        <span>{reactionCounts[favoriteReactionKey]}</span>
      {/if}
    </button>
  {/if}
  {#each Object.entries(reactionCounts).filter(([key]) => key !== favoriteReactionKey) as [key, count] (key)}
    <button
      type="button"
      class="flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-sm transition hover:border-primary hover:bg-primary/10"
      class:border-primary={activeReactionKey ? activeReactionKey === key : !filterMode && isLiked?.reactionKey === key}
      class:bg-primary={activeReactionKey ? activeReactionKey === key : !filterMode && isLiked?.reactionKey === key}
      aria-label={`${reactionEmoji[key] ?? '😀'} ${count} reaction${count === 1 ? '' : 's'}`}
      title={`${count} ${key} reaction${count === 1 ? '' : 's'}`}
      disabled={!onReaction}
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
  {:else if !filterMode && !disabled}
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
    onclick={() => {
      if (onComments) {
        onComments();
      } else {
        assetViewerManager.toggleActivityPanel();
      }
    }}
    aria-label={onComments ? 'Show photos with comments' : 'Open activity'}
    leadingIcon={mdiCommentOutline}
    shape="round"
    size="large"
    variant="ghost"
    color="secondary"
    class={activeComments ? 'border-primary bg-primary p-3 text-base' : 'p-3 text-base'}
  >
    {#if numberOfComments}
      {numberOfComments.toLocaleString($locale)}
    {/if}
  </Button>
</div>
