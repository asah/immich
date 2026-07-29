<script lang="ts">
  import { searchStore } from '$lib/stores/search.svelte';
  import { Icon, IconButton, Text } from '@immich/ui';
  import { mdiClose, mdiFolderOutline, mdiImageAlbum, mdiMagnify } from '@mdi/js';
  import type { AutocompleteResult } from './SearchBar.svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  interface Props {
    id: string;
    searchQuery?: string;
    results?: AutocompleteResult[];
    isSearchSuggestions?: boolean;
    isOpen?: boolean;
    onSelectSearchTerm: (searchTerm: string) => void;
    onSelectResult: (result: AutocompleteResult) => void;
    onClearSearchTerm: (searchTerm: string) => void;
    onClearAllSearchTerms: () => void;
    onActiveSelectionChange: (selectedId: string | undefined) => void;
  }

  let {
    id,
    searchQuery = '',
    results = [],
    isSearchSuggestions = $bindable(false),
    isOpen = false,
    onSelectSearchTerm,
    onSelectResult,
    onClearSearchTerm,
    onClearAllSearchTerms,
    onActiveSelectionChange,
  }: Props = $props();

  let filteredSearchTerms = $derived(
    searchStore.savedSearchTerms.filter((term) => term.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  let isAutocomplete = $derived(searchQuery.trim().length >= 2);

  $effect(() => {
    isSearchSuggestions = isAutocomplete ? results.length > 0 : filteredSearchTerms.length > 0;
  });

  let showClearAll = $derived(searchQuery === '' && !isAutocomplete);
  let suggestionCount = $derived(
    isAutocomplete ? results.length : showClearAll ? filteredSearchTerms.length + 1 : filteredSearchTerms.length,
  );

  let selectedIndex: number | undefined = $state(undefined);
  let element = $state<HTMLDivElement>();

  export function moveSelection(increment: 1 | -1) {
    if (!isSearchSuggestions) {
      return;
    }
    if (selectedIndex === undefined) {
      selectedIndex = increment === 1 ? 0 : suggestionCount - 1;
    } else if (selectedIndex + increment < 0 || selectedIndex + increment >= suggestionCount) {
      clearSelection();
    } else {
      selectedIndex = (selectedIndex + increment + suggestionCount) % suggestionCount;
    }
    onActiveSelectionChange(getId(selectedIndex));
  }

  export function clearSelection() {
    selectedIndex = undefined;
    onActiveSelectionChange(undefined);
  }

  export function selectActiveOption() {
    if (selectedIndex === undefined) {
      return;
    }
    const selectedElement = element?.querySelector(`#${getId(selectedIndex)}`) as HTMLElement;
    selectedElement?.click();
  }

  const handleClearAll = () => {
    clearSelection();
    onClearAllSearchTerms();
  };

  const handleClearSingle = (searchTerm: string) => {
    clearSelection();
    onClearSearchTerm(searchTerm);
  };

  const handleSelect = (searchTerm: string) => {
    clearSelection();
    onSelectSearchTerm(searchTerm);
  };

  const handleSelectResult = (result: AutocompleteResult) => {
    clearSelection();
    onSelectResult(result);
  };

  const getId = (index: number | undefined) => {
    if (index === undefined) {
      return undefined;
    }
    return `${id}-${index}`;
  };
</script>

<div role="listbox" {id} aria-label={$t('recent_searches')} bind:this={element}>
  {#if isOpen && isSearchSuggestions}
    <div
      transition:fly={{ y: 25, duration: 150 }}
      class="absolute z-1 w-full rounded-b-3xl border-2 border-t-0 border-gray-200 bg-white pb-5 shadow-2xl transition-all dark:border-gray-700 dark:bg-immich-dark-gray dark:text-gray-300"
    >
      <div class="flex items-center justify-between px-5 pt-5 text-xs">
        <Text class="py-2" color="muted" aria-hidden={true}>
          {isAutocomplete ? $t('search') : $t('recent_searches')}
        </Text>
        {#if showClearAll}
          <button
            id={getId(0)}
            type="button"
            class="rounded-lg p-2 font-semibold text-primary hover:bg-immich-primary/25 aria-selected:bg-immich-primary/25"
            role="option"
            onclick={() => handleClearAll()}
            tabindex="-1"
            aria-selected={selectedIndex === 0}
            aria-label={$t('clear_all_recent_searches')}
          >
            {$t('clear_all')}
          </button>
        {/if}
      </div>

      {#if isAutocomplete}
        {#each results as result, index (`${result.type}-${result.id}`)}
          <button
            id={getId(index)}
            type="button"
            class="flex w-full items-center gap-3 px-5 py-2 text-left text-sm text-black hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-500/30 dark:aria-selected:bg-gray-500/30"
            role="option"
            tabindex="-1"
            aria-selected={selectedIndex === index}
            aria-label={result.label}
            onclick={() => handleSelectResult(result)}
          >
            {#if result.thumbnailUrl}
              <span class="relative size-9 shrink-0">
                <img class="size-9 rounded-md object-cover" src={result.thumbnailUrl} alt="" />
                {#if result.type === 'album'}
                  <span
                    class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-white shadow-sm ring-2 ring-white dark:bg-immich-dark-primary dark:text-immich-dark-gray dark:ring-immich-dark-gray"
                    aria-hidden="true"
                  >
                    <Icon icon={mdiImageAlbum} size="13" />
                  </span>
                {/if}
              </span>
            {:else if result.type === 'album'}
              <span class="flex size-9 shrink-0 items-center justify-center" aria-hidden="true">
                <Icon icon={mdiFolderOutline} size="1.5em" />
              </span>
            {:else}
              <span class="size-9 shrink-0" aria-hidden="true"></span>
            {/if}
            <span class="min-w-0 truncate">{result.label}</span>
          </button>
        {/each}
      {:else}
        {#each filteredSearchTerms as savedSearchTerm, i (i)}
          {@const index = showClearAll ? i + 1 : i}
          <div class="flex w-full items-center justify-between text-sm text-black dark:text-gray-300">
            <div class="relative w-full items-center">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                id={getId(index)}
                class="relative flex w-full cursor-pointer gap-3 py-3 ps-5 hover:bg-gray-100 aria-selected:bg-gray-100 dark:hover:bg-gray-500/30 dark:aria-selected:bg-gray-500/30"
                onclick={() => handleSelect(savedSearchTerm)}
                role="option"
                tabindex="-1"
                aria-selected={selectedIndex === index}
                aria-label={savedSearchTerm}
              >
                <Icon icon={mdiMagnify} size="1.5em" aria-hidden />
                {savedSearchTerm}
              </div>
              <div aria-hidden={true} class="absolute inset-e-5 top-0 items-center justify-center py-3">
                <IconButton
                  shape="round"
                  color="secondary"
                  variant="ghost"
                  icon={mdiClose}
                  aria-label={$t('remove')}
                  size="medium"
                  tabindex={-1}
                  onclick={() => handleClearSingle(savedSearchTerm)}
                />
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
