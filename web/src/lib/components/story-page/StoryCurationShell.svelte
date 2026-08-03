<script lang="ts">
  import { Button, Field, Select } from '@immich/ui';
  import { t } from 'svelte-i18n';
  export type CurationState = 'include' | 'must_include' | 'maybe' | 'exclude';
  export type CurationItem = { id: string; used: boolean; state: CurationState; name?: string; thumbnailUrl?: string };
  let {
    items = $bindable(),
    onAddMedia,
    onChange,
    onPlace,
  }: {
    items: CurationItem[];
    onAddMedia?: () => void;
    onChange?: (items: CurationItem[]) => void;
    onPlace?: (assetId: string) => void;
  } = $props();
  let filter = $state<'all' | CurationState | 'used' | 'unplaced'>('all');
  const visible = $derived(
    items.filter(
      (item) =>
        filter === 'all' ||
        (filter === 'used' ? item.used : filter === 'unplaced' ? !item.used : item.state === filter),
    ),
  );
  const options = $derived([
    { label: $t('story_curation_include'), value: 'include' },
    { label: $t('story_curation_must_include'), value: 'must_include' },
    { label: $t('story_curation_maybe'), value: 'maybe' },
    { label: $t('story_curation_exclude'), value: 'exclude' },
  ]);
</script>

<section class="min-w-0 rounded-2xl border bg-surface-container-low p-4" aria-labelledby="curation-title">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 id="curation-title" class="font-semibold text-dark">{$t('story_curation')}</h2>
      <p class="text-sm text-gray-500">
        {$t('story_curation_summary', { values: { count: items.filter(({ used }) => !used).length } })}
      </p>
    </div>
    {#if onAddMedia}<Button size="small" onclick={onAddMedia}>{$t('story_add_media')}</Button>{/if}
  </div>
  <div class="mt-3 flex flex-wrap gap-1" aria-label={$t('story_curation_filter')}>
    {#each [{ label: $t('all'), value: 'all' }, ...options, { label: $t('story_curation_used'), value: 'used' }, { label: $t('story_curation_unplaced'), value: 'unplaced' }] as option (option.value)}
      <Button
        size="small"
        variant={filter === option.value ? 'filled' : 'ghost'}
        onclick={() => (filter = option.value as typeof filter)}>{option.label}</Button
      >
    {/each}
  </div>
  <ul class="mt-3 max-h-80 space-y-2 overflow-auto" aria-live="polite">
    {#each visible as item (item.id)}<li
        class="grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border bg-white p-2 dark:bg-gray-800"
      >
        {#if item.thumbnailUrl}<img
            class="size-10 rounded object-cover"
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
          />{/if}
        <div class="min-w-0">
          <div class="flex min-w-0 items-start justify-between gap-2">
            <span class="min-w-0 flex-1 break-all text-sm" title={item.name ?? item.id}>{item.name ?? item.id}</span><span
              class="shrink-0 text-xs text-gray-500">{item.used ? $t('story_curation_used') : $t('story_curation_unplaced')}</span
            >
          </div>
          <div class="mt-2 flex min-w-0 flex-wrap items-end gap-2">
            <div class="min-w-0 flex-1">
              <Field label={$t('story_curation_state_for', { values: { id: item.id } })}
                ><Select
                  value={item.state}
                  onChange={(state) => {
                    items = items.map((current) =>
                      current.id === item.id ? { ...current, state: state as CurationState } : current,
                    );
                    onChange?.(items);
                  }}
                  {options}
                /></Field
              >
            </div>
            {#if !item.used && onPlace}<Button size="small" onclick={() => onPlace?.(item.id)}
                >{$t('story_place_asset')}</Button
              >{/if}
          </div>
        </div>
      </li>
    {:else}<li class="p-3 text-sm text-gray-500">{$t('no_results')}</li>{/each}
  </ul>
</section>
