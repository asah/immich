<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { Route } from '$lib/route';
  import { getServerErrorMessage } from '$lib/utils/handle-error';
  import { acceptAlbumInvite } from '@immich/sdk';
  import { Alert, Button, Field, Input, PasswordInput, Stack, Text } from '@immich/ui';
  import { t } from 'svelte-i18n';

  let name = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');
  const token = new URLSearchParams(location.search).get('token') ?? '';

  const submit = async () => {
    if (!token) return;
    loading = true;
    error = '';
    try {
      const user = await acceptAlbumInvite({ albumInviteAcceptDto: { token, name, password } });
      eventManager.emit('AuthLogin', user);
      await goto(Route.albums());
    } catch (caught) {
      error = getServerErrorMessage(caught) || 'This invitation is invalid or has expired.';
      loading = false;
    }
  };
</script>

<AuthPageLayout title="Join shared album">
  <Stack gap={4}>
    <Text>Choose a password to create your account and join the shared album.</Text>
    {#if !token}
      <Alert color="danger">This invitation link is invalid.</Alert>
    {:else}
      {#if error}<Alert color="danger">{error}</Alert>{/if}
      <form onsubmit={(event) => { event.preventDefault(); void submit(); }} class="flex flex-col gap-4">
        <Field label={$t('name')} required><Input bind:value={name} autocomplete="name" /></Field>
        <Field label={$t('password')} required><PasswordInput bind:value={password} autocomplete="new-password" /></Field>
        <Button type="submit" size="large" disabled={!name.trim() || password.length < 8 || loading}>Create account and join album</Button>
      </form>
    {/if}
  </Stack>
</AuthPageLayout>
