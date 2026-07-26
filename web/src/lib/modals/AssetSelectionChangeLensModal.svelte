<script lang="ts">
  import Combobox, { asComboboxOptions, type ComboBoxOption } from '$lib/components/shared-components/Combobox.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { SearchSuggestionType, getSearchSuggestions, updateAssets } from '@immich/sdk';
  import { FormModal, toastManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    assetIds: string[];
    onClose: () => void;
  };

  let { assetIds, onClose }: Props = $props();
  let options: ComboBoxOption[] = $state([]);
  let selectedOption: ComboBoxOption | undefined = $state();
  let loading = $state(true);
  const clearLensValue = '__clear_lens__';

  onMount(async () => {
    try {
      const lenses = await getSearchSuggestions({ $type: SearchSuggestionType.CameraLensModel });
      options = [
        { id: clearLensValue, label: $t('clear_lens'), value: clearLensValue },
        ...asComboboxOptions(lenses.filter((lens): lens is string => Boolean(lens))),
      ];
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_lenses'));
    } finally {
      loading = false;
    }
  });

  const onSubmit = async () => {
    if (!selectedOption) {
      return;
    }

    try {
      const lensModel = selectedOption.value === clearLensValue ? null : selectedOption.value;
      await updateAssets({ assetBulkUpdateDto: { ids: assetIds, lensModel } });
      toastManager.primary($t('lens_updated'));
      onClose();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_lens'));
    }
  };
</script>

<FormModal title={$t('change_lens')} submitText={$t('save')} disabled={loading || !selectedOption} {onClose} {onSubmit}>
  <Combobox
    bind:selectedOption
    allowCreate
    label={$t('lens_model')}
    {options}
    placeholder={loading ? $t('loading') : $t('select_lens')}
  />
  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{$t('lens_picker_help')}</p>
</FormModal>
