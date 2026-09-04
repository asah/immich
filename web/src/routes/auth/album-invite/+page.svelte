<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { Route } from '$lib/route';
  import { getServerErrorMessage } from '$lib/utils/handle-error';
  import { acceptAlbumInvite, getAlbumInvitePreview, type AlbumInvitePreviewDto } from '@immich/sdk';
  import { Alert, Button, Field, Input, PasswordInput, Stack, Text } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let name = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');
  let preview = $state<AlbumInvitePreviewDto>();
  let previewLoading = $state(true);
  const fragmentToken = new URLSearchParams(location.hash.slice(1)).get('token');
  if (fragmentToken) {
    sessionStorage.setItem('albumInviteToken', fragmentToken);
    history.replaceState(null, '', location.pathname);
  }
  const token = fragmentToken ?? sessionStorage.getItem('albumInviteToken') ?? '';
  const claimUrl = '/auth/album-invite/claim';
  const loginUrl = Route.login({ continue: claimUrl });

  onMount(async () => {
    if (!token) {
      previewLoading = false;
      return;
    }
    try {
      preview = await getAlbumInvitePreview({ albumInviteTokenDto: { token } });
    } catch (caught) {
      error = getServerErrorMessage(caught) || 'This invitation is invalid or has expired.';
    } finally {
      previewLoading = false;
    }
  });

  const submit = async () => {
    if (!token) return;
    loading = true;
    error = '';
    try {
      const user = await acceptAlbumInvite({ albumInviteAcceptDto: { token, name, password } });
      sessionStorage.removeItem('albumInviteToken');
      eventManager.emit('AuthLogin', user);
      await goto(Route.viewAlbum({ id: user.albumId }));
    } catch (caught) {
      error = getServerErrorMessage(caught) || 'This invitation is invalid or has expired.';
      loading = false;
    }
  };
</script>

<AuthPageLayout title="Join shared album">
  <Stack gap={4}>
    {#if previewLoading}
      <Text>Loading your invitation…</Text>
    {:else if !token || !preview}
      <Alert color="danger">This invitation link is invalid.</Alert>
    {:else}
      <div class="rounded-lg border border-immich-primary/20 bg-immich-primary/5 p-4">
        <Text><strong>{preview.senderName}</strong> shared <strong>{preview.albumName}</strong> with you.</Text>
        <Text class="mt-1 text-sm text-immich-fg/70">This invite was sent to {preview.recipientEmail}.</Text>
      </div>
      {#if authManager.authenticated}
        <Text>You’re signed in as {authManager.user.email}.</Text>
        <Button size="large" onclick={() => goto(claimUrl)}>Join with this account</Button>
        <button class="text-sm text-immich-primary underline" type="button" onclick={() => authManager.logout()}
          >Use a different account</button
        >
      {:else}
        <Text
          >Create an account for the invited address. Keep this link private; it can be used by anyone who has it.</Text
        >
        {#if error}<Alert color="danger">{error}</Alert>{/if}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          class="flex flex-col gap-4"
        >
          <Field label={$t('name')} required><Input bind:value={name} autocomplete="name" /></Field>
          <Field label={$t('password')} required
            ><PasswordInput bind:value={password} autocomplete="new-password" /></Field
          >
          <Button type="submit" size="large" disabled={!name.trim() || password.length < 8 || loading}
            >Create account and join album</Button
          >
        </form>
        <Text class="text-center text-sm"
          >Already have an account? <a class="text-immich-primary underline" href={loginUrl}>Sign in to join</a></Text
        >
      {/if}
    {/if}
  </Stack>
</AuthPageLayout>
