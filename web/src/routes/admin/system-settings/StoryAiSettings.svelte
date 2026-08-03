<script lang="ts">
  import { Adapter, ApprovedEndpointId, updateServerStoryAiProvider } from '@immich/sdk';
  import { Button, Field, Input, PasswordInput, toastManager } from '@immich/ui';
  import { t } from 'svelte-i18n';
  let key = $state('');
  let model = $state('gpt-5.6-sol');
  let busy = $state(false);
  const save = async () => {
    busy = true;
    try {
      await updateServerStoryAiProvider({
        storyAiProviderUpdateDto: {
          adapter: Adapter.Openai,
          approvedEndpointId: ApprovedEndpointId.OpenaiPublic,
          credential: key,
          enabled: true,
          model,
        },
      });
      key = '';
      toastManager.success();
    } finally {
      busy = false;
    }
  };
</script>

<form
  class="m-4 flex max-w-xl flex-col gap-4"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <p class="text-sm text-gray-500">{$t('admin.story_ai_provider_description')}</p>
  <Field label={$t('story_ai_openai_key')}
    ><PasswordInput bind:value={key} autocomplete="new-password" required /></Field
  ><Field label={$t('story_ai_model')}><Input bind:value={model} required /></Field><Button
    type="submit"
    disabled={busy || !key}>{$t('save')}</Button
  >
</form>
