<script lang="ts">
  import { storyService } from '$lib/services/story.service';
  import { Button, Field, Input, PasswordInput } from '@immich/ui';
  import { t } from 'svelte-i18n';
  let { onSaved }: { onSaved: () => void } = $props();
  let key = $state('');
  let model = $state('gpt-5.6-sol');
  let busy = $state(false);
  let error = $state('');
  const describeError = (cause: unknown) => {
    if (cause && typeof cause === 'object') {
      const details = 'details' in cause ? cause.details : undefined;
      if (typeof details === 'string' && details) {
        try {
          const payload = JSON.parse(details) as { message?: string | string[]; error?: string };
          const message = payload.message ?? payload.error;
          if (Array.isArray(message)) {
            return message.join(', ');
          }
          if (typeof message === 'string' && message) {
            return message;
          }
        } catch {
          // Fall through to the standard error message for non-JSON responses.
        }
      }
      if ('body' in cause && typeof cause.body === 'object' && cause.body) {
        const body = cause.body as { message?: string | string[]; error?: string };
        const message = body.message ?? body.error;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string' && message) {
          return message;
        }
      }
    }
    return cause instanceof Error && cause.message ? cause.message : $t('story_ai_setup_error');
  };
  const submit = async () => {
    busy = true;
    error = '';
    try {
      await storyService.setupAiProvider(key, model);
      key = '';
      onSaved();
    } catch (cause) {
      error = describeError(cause);
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
