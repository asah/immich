<script lang="ts">
  import { Button, Field, Input, Select, Textarea } from '@immich/ui';
  import { StoryAspectRatio } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  type Brief = { title: string; description: string; aspectRatio: StoryAspectRatio };
  let {
    value = $bindable(),
    busy = false,
    onSubmit,
  }: { value: Brief; busy?: boolean; onSubmit: () => void } = $props();
</script>

<form
  class="mx-auto flex w-full max-w-2xl flex-col gap-5"
  onsubmit={(event) => {
    event.preventDefault();
    onSubmit();
  }}
>
  <div>
    <h1 class="text-2xl font-semibold text-dark">{$t('story_create_title')}</h1>
    <p class="mt-1 text-sm text-gray-500">{$t('story_create_description')}</p>
  </div>
  <Field label={$t('story_title')}>
    <Input bind:value={value.title} maxlength={200} required autofocus />
  </Field>
  <Field label={$t('description')} description={$t('story_description_hint')}>
    <Textarea bind:value={value.description} maxlength={10000} />
  </Field>
  <Field label={$t('story_format')}>
    <Select
      bind:value={value.aspectRatio}
      options={[
        { label: $t('story_format_portrait'), value: StoryAspectRatio.Portrait45 },
        { label: $t('story_format_landscape'), value: StoryAspectRatio.Landscape169 },
        { label: $t('story_format_square'), value: StoryAspectRatio.Square11 },
      ]}
    />
  </Field>
  <div class="flex justify-end">
    <Button type="submit" disabled={busy}>{busy ? $t('creating') : $t('create_story')}</Button>
  </div>
</form>
