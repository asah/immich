<script lang="ts">
  import SettingInputField from '$lib/components/shared-components/settings/SettingInputField.svelte';
  import RichTextEditor from '$lib/components/shared-components/RichTextEditor.svelte';
  import { SettingInputFieldType } from '$lib/constants';
  import { handleUpdateTag } from '$lib/services/tag.service';
  import type { TreeNode } from '$lib/utils/tree-utils';
  import { FormModal } from '@immich/ui';
  import { Field, Input } from '@immich/ui';
  import { mdiTag } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    tag: TreeNode;
    onClose: () => void;
  };

  const { tag, onClose }: Props = $props();

  let tagColor = $state(tag.color ?? '');
  let name = $state(tag.value.split('/').at(-1) ?? tag.value);
  let description = $state(tag.description ?? '');

  const onSubmit = async () => {
    const success = await handleUpdateTag(tag, { name, color: tagColor, description: description || null });
    if (success) {
      onClose();
    }
  };
</script>

<FormModal title={$t('edit_tag')} size="small" icon={mdiTag} {onClose} {onSubmit}>
  <SettingInputField inputType={SettingInputFieldType.COLOR} label={$t('color')} bind:value={tagColor} />
  <Field label={$t('tag')} required><Input bind:value={name} /></Field>
  <RichTextEditor label={$t('description')} bind:value={description} />
</FormModal>
