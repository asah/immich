<script lang="ts">
  import { Button } from '@immich/ui';

  type Reaction = { key: string; emoji: string; label: string };
  const popular: Reaction[] = [
    { key: 'heart', emoji: '❤️', label: 'Love' },
    { key: 'laugh', emoji: '😂', label: 'Laugh' },
    { key: 'wow', emoji: '😮', label: 'Wow' },
    { key: 'sad', emoji: '😢', label: 'Sad' },
    { key: 'celebrate', emoji: '🎉', label: 'Celebrate' },
    { key: 'like', emoji: '👍', label: 'Like' },
  ];
  const all: Reaction[] = [
    ...popular,
    { key: 'dislike', emoji: '👎', label: 'Dislike' },
    { key: 'angry', emoji: '😡', label: 'Angry' },
    { key: 'love', emoji: '🥰', label: 'Adore' },
    { key: 'fire', emoji: '🔥', label: 'Fire' },
    { key: 'clap', emoji: '👏', label: 'Applause' },
    { key: 'thanks', emoji: '🙏', label: 'Thanks' },
    { key: 'party', emoji: '🥳', label: 'Party' },
    { key: 'thinking', emoji: '🤔', label: 'Thinking' },
    { key: 'support', emoji: '💪', label: 'Support' },
    { key: 'rocket', emoji: '🚀', label: 'Rocket' },
    { key: 'eyes', emoji: '👀', label: 'Watching' },
    { key: 'sparkles', emoji: '✨', label: 'Sparkles' },
    { key: 'smile', emoji: '😊', label: 'Smile' },
    { key: 'wink', emoji: '😉', label: 'Wink' },
    { key: 'kiss', emoji: '😘', label: 'Kiss' },
    { key: 'confused', emoji: '😕', label: 'Confused' },
    { key: 'cry', emoji: '😭', label: 'Crying' },
    { key: 'poop', emoji: '💩', label: 'Oh no' },
  ];

  let {
    onSelect,
    compact = false,
    selectedEmoji = '😀',
    count = 0,
    buttonLabel = 'Add reaction',
  }: {
    onSelect: (reaction: Reaction) => void;
    compact?: boolean;
    selectedEmoji?: string;
    count?: number;
    buttonLabel?: string;
  } = $props();
  let open = $state(false);
  let popupStyle = $state('');

  const popupWidth = 256;
  const popupEdgeOffset = 8;

  const togglePicker = (event: MouseEvent) => {
    open = !open;
    if (open) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const maxLeft = Math.max(popupEdgeOffset, window.innerWidth - popupWidth - popupEdgeOffset);
      const left = Math.min(Math.max(popupEdgeOffset, rect.left), maxLeft);
      popupStyle = `left: ${left}px; bottom: ${window.innerHeight - rect.top + 8}px;`;
    }
  };
</script>

<div class="relative">
  <Button size="small" variant="ghost" aria-label={buttonLabel} onclick={togglePicker}>
    <span class="text-lg">{selectedEmoji}</span>{#if count}<span>{count.toLocaleString()}</span>{/if}
  </Button>
  {#if open}
    <div
      class="fixed z-[100] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-300 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={popupStyle}
    >
      <div class="grid grid-cols-6 gap-1" aria-label="Popular reactions">
        {#each popular as reaction}
          <button
            class="rounded p-1 text-xl hover:bg-gray-100 dark:hover:bg-gray-800"
            title={reaction.label}
            aria-label={reaction.label}
            onclick={() => {
              onSelect(reaction);
              open = false;
            }}>{reaction.emoji}</button
          >
        {/each}
      </div>
      {#if !compact}
        <div
          class="mt-2 grid max-h-32 grid-cols-8 gap-1 overflow-y-auto border-t border-gray-200 pt-2 dark:border-gray-700"
          aria-label="All reactions"
        >
          {#each all.slice(popular.length) as reaction}
            <button
              class="rounded p-1 text-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              title={reaction.label}
              aria-label={reaction.label}
              onclick={() => {
                onSelect(reaction);
                open = false;
              }}>{reaction.emoji}</button
            >
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
