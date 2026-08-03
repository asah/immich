<script lang="ts">
  import SharedLinkExpiration from '$lib/components/SharedLinkExpiration.svelte';
  import { Field, HelperText, Input, PasswordInput, Switch, Text } from '@immich/ui';
  import { t } from 'svelte-i18n';

  type Props = {
    slug: string;
    password: string;
    description: string;
    allowDownload: boolean;
    allowUpload: boolean;
    showMetadata: boolean;
    expiresAt: string | null;
    allowUploadVisible?: boolean;
    downloadRequiresMetadata?: boolean;
  };

  let {
    slug = $bindable(),
    password = $bindable(),
    description = $bindable(),
    allowDownload = $bindable(),
    allowUpload = $bindable(),
    showMetadata = $bindable(),
    expiresAt = $bindable(),
    allowUploadVisible = true,
    downloadRequiresMetadata = true,
  }: Props = $props();

  $effect(() => {
    if (downloadRequiresMetadata && !showMetadata && allowDownload) {
      allowDownload = false;
    }
  });
</script>

<div class="mt-4 flex flex-col gap-4">
  <div>
    <Field label={$t('shared_link_custom_url_title')} description={$t('shared_link_custom_url_description')}>
      <Input bind:value={slug} autocomplete="off" />
      {#if slug.includes('/')}
        <HelperText class="text-warning">{$t('shared_link_custom_url_warning')}</HelperText>
      {/if}
    </Field>
    {#if slug}
      <Text size="tiny" color="muted" class="pt-2 break-all">/s/{encodeURIComponent(slug)}</Text>
    {/if}
  </div>

  <Field label={$t('password')} description={$t('shared_link_password_description')}>
    <PasswordInput bind:value={password} autocomplete="new-password" />
  </Field>

  <Field label={$t('description')}>
    <Input bind:value={description} autocomplete="off" />
  </Field>

  <SharedLinkExpiration bind:expiresAt />
  <Field label={$t('show_metadata')}>
    <Switch bind:checked={showMetadata} />
  </Field>

  <Field label={$t('allow_public_user_to_download')} disabled={downloadRequiresMetadata && !showMetadata}>
    <Switch bind:checked={allowDownload} />
  </Field>

  {#if allowUploadVisible}
    <Field label={$t('allow_public_user_to_upload')}>
      <Switch bind:checked={allowUpload} />
    </Field>
  {/if}
</div>
