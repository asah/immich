<script lang="ts">
  import { getAssetThumbnailPath, getBaseUrl, searchAssets, type AssetResponseDto } from '@immich/sdk';
  import { FormModal, Input, LoadingSpinner } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  let { onClose }: { onClose: (assets?: AssetResponseDto[]) => void } = $props();
  let assets = $state<AssetResponseDto[]>([]);
  let selected = $state<AssetResponseDto[]>([]);
  let query = $state('');
  let loading = $state(true);
  let error = $state('');
  let page = $state(1);
  let hasMore = $state(false);
  let searchTimer: ReturnType<typeof setTimeout>;
  const load = async (reset = false) => {
    loading = true;
    error = '';
    const requestedPage = reset ? 1 : page;
    try {
      const response = await searchAssets({
        metadataSearchDto: { size: 100, page: requestedPage, originalFileName: query.trim() || undefined },
      });
      assets = reset ? response.assets.items : [...assets, ...response.assets.items];
      page = requestedPage + 1;
      hasMore = response.assets.nextPage !== null;
    } catch {
      error = $t('story_asset_picker_error');
    } finally {
      loading = false;
    }
  };
  onMount(() => load(true));
  const search = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 300);
  };
  const toggle = (asset: AssetResponseDto) =>
    (selected = selected.some(({ id }) => id === asset.id)
      ? selected.filter(({ id }) => id !== asset.id)
      : [...selected, asset]);
</script>

<FormModal
  title={$t('story_choose_photos')}
  size="large"
  {onClose}
  disabled={!selected.length}
  submitText={$t('add')}
  onSubmit={() => onClose(selected)}
  ><Input
    bind:value={query}
    oninput={search}
    placeholder={$t('search_photos')}
  />{#if loading && assets.length === 0}<div class="flex min-h-60 items-center justify-center">
      <LoadingSpinner />
    </div>{:else if error && assets.length === 0}<div class="flex min-h-60 flex-col items-center justify-center gap-3">
      <p role="alert" class="text-red-600">{error}</p>
      <button class="underline" type="button" onclick={() => load(true)}>{$t('story_retry')}</button>
    </div>{:else if assets.length === 0}<p class="p-10 text-center text-gray-500">{$t('no_results')}</p>{:else}<div
      class="mt-3 grid max-h-[65dvh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3 md:grid-cols-5"
      role="group"
      aria-label={$t('story_choose_photos')}
    >
      {#each assets as asset (asset.id)}<label
          class="relative cursor-pointer rounded-lg focus-within:ring-2 focus-within:ring-primary"
          ><input
            class="absolute top-2 left-2 z-10 size-6"
            type="checkbox"
            checked={selected.some(({ id }) => id === asset.id)}
            onchange={() => toggle(asset)}
            aria-label={asset.originalFileName}
          /><img
            class="aspect-square w-full rounded-lg object-cover"
            src={`${getBaseUrl()}${getAssetThumbnailPath(asset.id)}`}
            alt=""
            loading="lazy"
          /></label
        >{/each}
    </div>{/if}
  {#if assets.length && hasMore}<div class="mt-3 flex justify-center">
      <button class="rounded-lg border px-4 py-2" type="button" disabled={loading} onclick={() => load()}>
        {loading ? $t('loading') : $t('load_more')}
      </button>
    </div>{/if}
</FormModal>
