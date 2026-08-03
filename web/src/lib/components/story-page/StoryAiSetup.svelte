<script lang="ts">
  import { storyService } from '$lib/services/story.service';
  import { Button, Field, Input, PasswordInput } from '@immich/ui';
  import { t } from 'svelte-i18n';
  let { onSaved }: { onSaved: () => void } = $props();
  let key = $state('');
  let model = $state('gpt-5.6-sol');
  let busy = $state(false);
  let error = $state('');
  const submit = async () => {
    busy = true;
    error = '';
    try {
      await storyService.setupAiProvider(key, model);
      key = '';
      onSaved();
    } catch {
      error = $t('story_ai_setup_error');
    } finally {
      busy = false;
    }
  };
</script>

<form
  class="mt-4 space-y-3 rounded-lg border p-3"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <h3 class="font-semibold">{$t('story_ai_setup')}</h3>
  <p class="text-sm text-gray-500">{$t('story_ai_setup_description')}</p>
  <Field label={$t('story_ai_openai_key')}
    ><PasswordInput bind:value={key} autocomplete="new-password" required /></Field
  ><Field label={$t('story_ai_model')}><Input bind:value={model} required /></Field>{#if error}<p
      role="alert"
      class="text-red-600"
    >
      {error}
    </p>{/if}<Button type="submit" disabled={busy || !key}>{$t('save')}</Button>
</form>
