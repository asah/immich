<script lang="ts">
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import AssetSelectionChangeLensModal from '$lib/modals/AssetSelectionChangeLensModal.svelte';
  import { modalManager } from '@immich/ui';
  import { mdiCameraIris } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    menuItem?: boolean;
  };

  let { menuItem = false }: Props = $props();

  const onAction = async () => {
    const assetIds = assetMultiSelectManager.assets.map(({ id }) => id);
    await modalManager.show(AssetSelectionChangeLensModal, { assetIds });
  };
</script>

{#if menuItem}
  <MenuOption text={$t('change_lens')} icon={mdiCameraIris} onClick={onAction} />
{/if}
