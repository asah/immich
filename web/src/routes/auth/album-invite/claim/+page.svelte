<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getServerErrorMessage } from '$lib/utils/handle-error';
  import { claimAlbumInvite } from '@immich/sdk';
  import { Alert, Stack, Text } from '@immich/ui';
  import { onMount } from 'svelte';

  const token = sessionStorage.getItem('albumInviteToken') ?? '';
  let error = $state('');

  onMount(async () => {
    if (!token) {
      error = 'This invitation link is invalid.';
      return;
    }
    try {
      const { albumId } = await claimAlbumInvite({ albumInviteTokenDto: { token } });
      sessionStorage.removeItem('albumInviteToken');
      await goto(Route.viewAlbum({ id: albumId }));
    } catch (caught) {
      error = getServerErrorMessage(caught) || 'This invitation is invalid or belongs to another email address.';
    }
  });
</script>

<AuthPageLayout title="Joining shared album">
  <Stack gap={4}>
    {#if error}
      <Alert color="danger">{error}</Alert>
    {:else}
      <Text>Adding this shared album to your account…</Text>
    {/if}
  </Stack>
</AuthPageLayout>
