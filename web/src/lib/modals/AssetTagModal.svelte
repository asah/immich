<script lang="ts">
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import { getAllTags, getAssetInfo, upsertTags, type TagResponseDto } from '@immich/sdk';
  import { Button, Checkbox, Label, Modal, ModalBody, ModalFooter, Text } from '@immich/ui';
  import { mdiTag } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import Combobox, { type ComboBoxOption } from '../components/shared-components/Combobox.svelte';
  import TagPill from '../components/shared-components/TagPill.svelte';

  interface Props {
    onClose: (updated?: boolean) => void;
    assetIds: string[];
  }

  let { onClose, assetIds }: Props = $props();

  let allTags: TagResponseDto[] = $state([]);
  let tagMap = $derived(Object.fromEntries(allTags.map((tag) => [tag.id, tag])));
  let selectedIds = new SvelteSet<string>();
  let tagCounts = new SvelteMap<string, number>();
  let tagChanges = new SvelteMap<string, boolean>();
  let existingTags = $derived(allTags.filter((tag) => tagCounts.has(tag.id)));
  let disabled = $derived(selectedIds.size === 0 && tagChanges.size === 0);
  let allowCreate: boolean = $state(true);
  const formId = 'asset-tag-form';

  onMount(async () => {
    allTags = await getAllTags();
    const selectedAssets = await Promise.all(assetIds.map((id) => getAssetInfo({ id })));

    for (const asset of selectedAssets) {
      for (const tag of asset.tags || []) {
        const tagId = typeof tag === 'string' ? tag : tag.id;
        tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
      }
    }
  });

  const onSubmit = async () => {
    if (disabled) {
      return;
    }

    const tagIdsToAdd = [
      ...selectedIds,
      ...[...tagChanges.entries()].filter(([, shouldApply]) => shouldApply).map(([tagId]) => tagId),
    ];
    const tagIdsToRemove = [...tagChanges.entries()].filter(([, shouldApply]) => !shouldApply).map(([tagId]) => tagId);

    if (tagIdsToAdd.length > 0) {
      await tagAssets({ tagIds: tagIdsToAdd, assetIds, showNotification: false });
    }
    if (tagIdsToRemove.length > 0) {
      await removeTag({ tagIds: tagIdsToRemove, assetIds, showNotification: false });
    }

    eventManager.emit('AssetsTag', assetIds);
    onClose(true);
  };

  const handleSelect = async (option?: ComboBoxOption) => {
    if (!option) {
      return;
    }

    if (option.id) {
      if (tagCounts.has(option.value)) {
        updateTagState(option.value, true);
      } else {
        selectedIds.add(option.value);
      }
    } else {
      const [newTag] = await upsertTags({ tagUpsertDto: { tags: [option.label] } });
      allTags.push(newTag);
      selectedIds.add(newTag.id);
    }
  };

  const handleRemove = (tag: string) => {
    selectedIds.delete(tag);
  };

  const getTagState = (tagId: string): boolean | 'indeterminate' => {
    const changedState = tagChanges.get(tagId);
    if (changedState !== undefined) {
      return changedState;
    }

    const count = tagCounts.get(tagId) || 0;
    return count === assetIds.length ? true : count === 0 ? false : 'indeterminate';
  };

  const updateTagState = (tagId: string, shouldApply: boolean) => {
    const originalState = getTagStateWithoutChange(tagId);
    if (originalState === shouldApply) {
      tagChanges.delete(tagId);
    } else {
      tagChanges.set(tagId, shouldApply);
    }
  };

  const getTagStateWithoutChange = (tagId: string): boolean | 'indeterminate' => {
    const count = tagCounts.get(tagId) || 0;
    return count === assetIds.length ? true : count === 0 ? false : 'indeterminate';
  };
</script>

<Modal
  size="small"
  title={$t('tag_assets')}
  icon={mdiTag}
  {onClose}
  class="asset-tag-modal h-auto max-h-[calc(100dvh-2rem)]"
  onOpenAutoFocus={(event) => event.preventDefault()}
  onEscapeKeydown={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <ModalBody class="min-h-0 overflow-y-auto">
    <form
      id={formId}
      onsubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div class="my-4 flex flex-col gap-2">
        <Combobox
          onSelect={handleSelect}
          onEnter={onSubmit}
          onEscape={onClose}
          label={$t('tag')}
          {allowCreate}
          forceFocus
          options={allTags.map((tag) => ({ id: tag.id, label: tag.value, value: tag.id }))}
          placeholder={$t('search_tags')}
        />
      </div>

      {#if existingTags.length > 0}
        <section class="flex flex-col gap-2 pt-2" aria-label={$t('tags')}>
          <Text color="muted" size="small">{$t('tags')}</Text>
          <div class="flex max-h-48 shrink overflow-y-auto">
            {#each existingTags as tag (tag.id)}
              {@const id = `tag-checkbox-${tag.id}`}
              <div class="flex items-center gap-2">
                <Checkbox
                  {id}
                  size="tiny"
                  checked={getTagState(tag.id) === true}
                  indeterminate={getTagState(tag.id) === 'indeterminate'}
                  onCheckedChange={(checked) => updateTagState(tag.id, checked === true)}
                />
                <Label for={id} label={tag.value} class="text-sm font-normal" />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <section class="flex flex-wrap gap-1 pt-2">
        {#each selectedIds as tagId (tagId)}
          {@const tag = tagMap[tagId]}
          {#if tag}
            <TagPill label={tag.value} onRemove={() => handleRemove(tagId)} />
          {/if}
        {/each}
      </section>
    </form>
  </ModalBody>
  <ModalFooter>
    <div class="flex w-full gap-2">
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button shape="round" type="submit" color="primary" fullWidth {disabled} form={formId}>{$t('tag_assets')}</Button>
    </div>
  </ModalFooter>
</Modal>

<style>
  @media (max-width: 639px) {
    :global([data-dialog-content]:has(.asset-tag-modal) > div) {
      justify-content: flex-start;
    }
  }
</style>
