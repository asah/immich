<script lang="ts">
  import SearchHistorySection from './SearchHistorySection.svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import { Button, Text } from '@immich/ui';
  import {
    mdiAccount,
    mdiCalendarBlank,
    mdiChevronDown,
    mdiChevronUp,
    mdiImage,
    mdiMagnify,
    mdiMapMarker,
    mdiTagMultiple,
    mdiTune,
  } from '@mdi/js';
  import SearchLocationSection from './SearchLocationSection.svelte';
  import { getAllTags, type PersonResponseDto, type TagResponseDto } from '@immich/sdk';
  import SearchMediaSection from './SearchMediaSection.svelte';
  import SearchCameraSection from './SearchCameraSection.svelte';
  import SearchDateSection from './SearchDateSection.svelte';
  import SearchPeopleSection from './SearchPeopleSection.svelte';
  import SearchTagsSection from './SearchTagsSection.svelte';
  import SearchTextSection from './SearchTextSection.svelte';
  import SearchDisplaySection from './SearchDisplaySection.svelte';
  import SearchRatingsSection from './SearchRatingsSection.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import {
    getPeople,
    getSearchDatePreset,
    getSearchDateTitle,
    getSearchMediaTitle,
    getSearchPeopleTitle,
    getSearchPlacesTitle,
    getSearchTagsTitle,
    getSearchTypeTitle,
  } from './search-bar-utils';
  import { onMount } from 'svelte';
  import { searchManager } from '$lib/managers/search-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { QueryType } from '$lib/constants';
  import { Route } from '$lib/route';
  import { lang } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { AssetMediaSize, AssetVisibility, getAllAlbums, searchAssets, searchSmart } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageMultiple } from '@mdi/js';
  import { combineDirectSearchResults, type DirectSearchResult } from './direct-search-utils';
  import SearchButton from './SearchButton.svelte';

  interface Props {
    id: string;
    isOpen?: boolean;
    onSelectSearchTerm: (searchTerm: string) => void;
    onClearSearchTerm: (searchTerm: string) => void;
    onClearAllSearchTerms: () => void;
    onActiveSelectionChange: (selectedId: string | undefined) => void;
    onSearch: () => void;
  }

  let {
    id,
    isOpen = false,
    onSelectSearchTerm,
    onClearSearchTerm,
    onClearAllSearchTerms,
    onActiveSelectionChange,
    onSearch,
  }: Props = $props();

  let searchHistory = $state<SearchHistorySection>();
  let directResults = $state<DirectSearchResult[]>([]);
  let directSelectedIndex = $state<number>();
  let directRequestId = 0;

  let activeFilter = $state('type');
  let showAdvanced = $state(false);
  let peoplePromise = $state<Promise<PersonResponseDto[]>>();
  let people = $state<PersonResponseDto[]>();
  let tagsPromise = $state<Promise<TagResponseDto[]>>();
  let tags = $state<TagResponseDto[]>();

  let typeTitle = $derived(getSearchTypeTitle(searchManager.filter.queryType));
  let peopleTitle = $state<string>();
  let dateTitle = $derived(
    getSearchDateTitle(
      getSearchDatePreset(searchManager.filter.date.takenAfter, searchManager.filter.date.takenBefore),
      searchManager.filter.date.takenAfter,
      searchManager.filter.date.takenBefore,
    ),
  );
  let placesTitle = $derived(
    getSearchPlacesTitle(
      searchManager.filter.location.city,
      searchManager.filter.location.state,
      searchManager.filter.location.country,
    ),
  );
  let tagsTitle = $state<string>();
  let mediaTitle = $derived(getSearchMediaTitle(searchManager.filter.mediaType));

  let filters = [
    {
      name: 'type',
      icon: mdiMagnify,
      title: $t('search_type'),
      activeTitle: () => typeTitle,
    },
    {
      name: 'people',
      icon: mdiAccount,
      title: $t('people'),
      activeTitle: () => peopleTitle,
    },
    {
      name: 'date',
      icon: mdiCalendarBlank,
      title: $t('date'),
      activeTitle: () => dateTitle,
    },
    {
      name: 'places',
      icon: mdiMapMarker,
      title: $t('places'),
      activeTitle: () => placesTitle,
    },
    ...(authManager.authenticated && authManager.preferences.tags.enabled
      ? [
          {
            name: 'tags',
            icon: mdiTagMultiple,
            title: $t('tags'),
            activeTitle: () => tagsTitle,
          },
        ]
      : []),
    {
      name: 'media',
      icon: mdiImage,
      title: $t('media'),
      activeTitle: () => mediaTitle,
    },
  ];

  const advancedFiltersSet = $derived(
    searchManager.filter.display.isArchive ||
      searchManager.filter.display.isFavorite ||
      searchManager.filter.display.isNotInAlbum ||
      searchManager.filter.rating,
  );

  const clear = () => {
    searchManager.reset();
    peopleTitle = tagsTitle = undefined;
  };

  onMount(() => {
    if (searchManager.filter.personIds.size > 0 && !peoplePromise) {
      peoplePromise = getPeople(searchManager.filter.personIds);
      void peoplePromise.then((res) => (people = res));
    }

    if (searchManager.filter.tagIds?.size && !tagsPromise) {
      tagsPromise = getAllTags();
      void tagsPromise.then((res) => (tags = res));
    }
  });

  $effect(() => {
    if (people) {
      peopleTitle = getSearchPeopleTitle(people, searchManager.filter.personIds);
    }
  });

  $effect(() => {
    if (searchManager.filter.tagIds === null) {
      tagsTitle = $t('untagged');
    } else if (tags) {
      tagsTitle = getSearchTagsTitle(tags, searchManager.filter.tagIds);
    }
  });

  $effect(() => {
    const term = searchManager.filter.query.trim();
    const query = searchManager.getQuery();
    const smartEnabled = featureFlagsManager.value.smartSearch;
    const language = $lang;
    const requestId = ++directRequestId;
    directResults = [];
    directSelectedIndex = undefined;

    if (!isOpen || !term) {
      return;
    }

    const timer = setTimeout(() => {
      const searchDto = { ...query, page: 1, size: 10, visibility: AssetVisibility.Timeline };
      const assetRequest =
        searchManager.filter.queryType === QueryType.SMART && smartEnabled
          ? searchSmart({ smartSearchDto: { ...searchDto, query: term, language } })
          : searchAssets({
              metadataSearchDto: {
                ...searchDto,
                originalFileName:
                  searchManager.filter.queryType === QueryType.SMART && !smartEnabled
                    ? term
                    : 'originalFileName' in searchDto
                      ? searchDto.originalFileName
                      : undefined,
              },
            });

      void Promise.all([getAllAlbums({ nameContains: term, limit: 10 }), assetRequest])
        .then(([albums, response]) => {
          if (requestId === directRequestId) {
            directResults = combineDirectSearchResults(albums, response.assets.items);
            directSelectedIndex = undefined;
            searchHistory?.clearSelection();
          }
        })
        .catch((error: unknown) => {
          if (requestId === directRequestId) {
            directResults = [];
            handleError(error, $t('loading_search_results_failed'));
          }
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      directRequestId++;
    };
  });

  export function moveSelection(increment: 1 | -1) {
    if (directResults.length > 0) {
      const nextIndex =
        directSelectedIndex === undefined
          ? increment === 1
            ? 0
            : directResults.length - 1
          : directSelectedIndex + increment;
      directSelectedIndex = nextIndex >= 0 && nextIndex < directResults.length ? nextIndex : undefined;
      searchHistory?.clearSelection();
      onActiveSelectionChange(directSelectedIndex === undefined ? undefined : `${id}-direct-${directSelectedIndex}`);
      return;
    }
    if (searchHistory) {
      searchHistory.moveSelection(increment);
    }
  }

  export function clearSelection() {
    directSelectedIndex = undefined;
    if (searchHistory) {
      searchHistory.clearSelection();
    }
  }

  export function selectActiveOption() {
    if (directSelectedIndex !== undefined) {
      document.querySelector<HTMLElement>(`#${CSS.escape(`${id}-direct-${directSelectedIndex}`)}`)?.click();
      return;
    }
    if (searchHistory) {
      searchHistory.selectActiveOption();
    }
  }
</script>

<div role="listbox" {id}>
  {#if isOpen}
    <div
      transition:fly={{ y: 25, duration: 250 }}
      class="absolute z-1 max-h-[80svh] w-full overflow-y-auto rounded-b-3xl bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-all dark:bg-immich-dark-gray dark:text-gray-300"
    >
      {#if directResults.length > 0}
        <div class="border-b border-light-200 py-2 dark:border-dark-600">
          {#each directResults as result, index (result.type === 'album' ? result.album.id : result.asset.id)}
            {@const isAlbum = result.type === 'album'}
            {@const assetId = isAlbum ? result.album.albumThumbnailAssetId : result.asset.id}
            <a
              id={`${id}-direct-${index}`}
              href={isAlbum ? Route.viewAlbum(result.album) : Route.viewAsset(result.asset)}
              role="option"
              tabindex="-1"
              aria-selected={directSelectedIndex === index}
              class="flex items-center gap-3 px-5 py-2 text-immich-fg hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-immich-dark-fg dark:hover:bg-gray-500/30 dark:aria-selected:bg-gray-500/30"
            >
              <span
                class="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700"
              >
                {#if assetId}
                  <img
                    src={getAssetMediaUrl({ id: assetId, size: AssetMediaSize.Thumbnail })}
                    alt=""
                    class="size-full object-cover"
                  />
                {:else}
                  <Icon icon={mdiImageMultiple} size="22" aria-hidden />
                {/if}
                {#if isAlbum}
                  <span
                    class="absolute inset-e-0 bottom-0 rounded-tl bg-primary px-1 text-[9px] font-semibold text-white dark:bg-immich-dark-primary dark:text-black"
                    >{$t('album')}</span
                  >
                {/if}
              </span>
              <span class="min-w-0 truncate">{isAlbum ? result.album.albumName : result.asset.originalFileName}</span>
            </a>
          {/each}
        </div>
      {/if}
      <SearchHistorySection
        bind:this={searchHistory}
        {onSelectSearchTerm}
        {onClearSearchTerm}
        {onClearAllSearchTerms}
        {onActiveSelectionChange}
      />
      <div class="px-5">
        <Text class="py-5" fontWeight="medium" aria-hidden={true}>{$t('filter_by')}</Text>
        <div class="flex flex-wrap gap-2">
          {#each filters as item (item.name)}
            <SearchButton
              active={activeFilter === item.name || Boolean(item.activeTitle())}
              leadingIcon={item.icon}
              class={activeFilter === item.name ? 'border-2' : undefined}
              onclick={() => (activeFilter = item.name)}
            >
              {item.activeTitle() ?? item.title}
            </SearchButton>
          {/each}
        </div>
      </div>
      {#if activeFilter}
        <div class="px-5 pt-5">
          {#if activeFilter === 'type'}
            <SearchTextSection />
          {:else if activeFilter === 'people'}
            <SearchPeopleSection bind:title={peopleTitle} parentPromise={peoplePromise} />
          {:else if activeFilter === 'date'}
            <SearchDateSection />
          {:else if activeFilter === 'places'}
            <SearchLocationSection />
          {:else if activeFilter === 'tags'}
            <SearchTagsSection bind:title={tagsTitle} parentPromise={tagsPromise} />
          {:else if activeFilter === 'media'}
            <SearchMediaSection />
          {/if}
        </div>
      {/if}
      <div
        class="grid transition-[grid-template-rows] duration-200 ease-in-out {showAdvanced
          ? 'grid-rows-[1fr]'
          : 'grid-rows-[0fr]'}"
        inert={!showAdvanced}
      >
        <div class="overflow-hidden">
          <div class="my-5 h-px w-full bg-light-200 dark:bg-dark-600"></div>
          <div class="px-5">
            <SearchCameraSection />
            {#if authManager.authenticated && authManager.preferences.ratings.enabled}
              <SearchRatingsSection />
            {/if}
            <SearchDisplaySection />
          </div>
        </div>
      </div>
      <div class="my-5 h-px w-full bg-light-200 dark:bg-dark-600"></div>
      <div class="flex flex-wrap gap-2 px-5 pb-5">
        <Button
          size="small"
          variant={advancedFiltersSet ? 'outline' : 'ghost'}
          leadingIcon={mdiTune}
          trailingIcon={showAdvanced ? mdiChevronUp : mdiChevronDown}
          onclick={() => (showAdvanced = !showAdvanced)}>{$t('advanced_filters')}</Button
        >
        <div class="flex-1"></div>
        <Button
          size="small"
          shape="round"
          variant="outline"
          color="secondary"
          class="bg-transparent"
          onclick={() => clear()}>{$t('clear_all')}</Button
        >
        <Button size="small" shape="round" onclick={() => onSearch()}>{$t('search')}</Button>
      </div>
    </div>
  {/if}
</div>
