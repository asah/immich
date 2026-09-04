<script lang="ts">
  import { initInput } from '$lib/actions/focus';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { handleAddUsersToAlbum, handleInviteEmailsToAlbum } from '$lib/services/album.service';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import {
    getPendingInvites,
    revokeInvite,
    searchUsers,
    type AlbumInviteResponseDto,
    type AlbumResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { FormModal, ListButton, LoadingSpinner, Stack, Text } from '@immich/ui';
  import { sortBy } from 'lodash-es';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';

  type Props = {
    album: AlbumResponseDto;
    onClose: () => void;
  };

  let search = $state('');
  let emails = $state('');

  const { album, onClose }: Props = $props();

  let users: UserResponseDto[] = $state([]);
  let pendingInvites: AlbumInviteResponseDto[] = $state([]);
  const excludedUserIds = $derived(album.albumUsers.map(({ user: { id } }) => id));
  const filteredUsers = $derived(
    sortBy(
      users.filter(
        (user) =>
          !excludedUserIds.includes(user.id) &&
          normalizeSearchString(user.name).includes(normalizeSearchString(search)),
      ),
      ['name'],
    ),
  );
  const selectedUsers = new SvelteMap<string, UserResponseDto>();
  let loading = $state(true);

  const handleToggle = (user: UserResponseDto) => {
    if (selectedUsers.has(user.id)) {
      selectedUsers.delete(user.id);
    } else {
      selectedUsers.set(user.id, user);
    }
  };

  const onSubmit = async () => {
    const emailAddresses = [
      ...new Set(
        emails
          .split(/[;,\s]+/)
          .map((email) => email.trim())
          .filter(Boolean),
      ),
    ];
    const existingSuccess =
      selectedUsers.size === 0 || (await handleAddUsersToAlbum(album, [...selectedUsers.values()]));
    const emailSuccess = emailAddresses.length === 0 || (await handleInviteEmailsToAlbum(album, emailAddresses));
    const success = existingSuccess && emailSuccess;
    if (success) {
      onClose();
    }
  };

  const revokePendingInvite = async (invite: AlbumInviteResponseDto) => {
    await revokeInvite({ id: album.id, inviteId: invite.id });
    pendingInvites = pendingInvites.filter(({ id }) => id !== invite.id);
  };

  onMount(async () => {
    [users, pendingInvites] = await Promise.all([searchUsers(), getPendingInvites({ id: album.id })]);
    loading = false;
  });
</script>

<FormModal
  title={$t('users')}
  submitText={$t('add')}
  cancelText={$t('back')}
  {onSubmit}
  disabled={selectedUsers.size === 0 && emails.trim().length === 0}
  {onClose}
>
  {#if loading}
    <div class="flex w-full place-content-center place-items-center">
      <LoadingSpinner />
    </div>
  {:else}
    <Stack>
      <input
        class="border-b-4 border-immich-bg px-6 py-2 text-2xl focus:border-immich-primary dark:border-immich-dark-gray dark:focus:border-immich-dark-primary"
        placeholder="Email address (separate multiple addresses with commas)"
        bind:value={emails}
        type="email"
        multiple
      />
      {#if emails.trim()}
        <Text size="small" color="muted"
          >New people receive a one-time link to create an account and join this album.</Text
        >
      {/if}
      {#if pendingInvites.length > 0}
        <div class="rounded-lg border border-immich-primary/20 p-3">
          <Text fontWeight="medium">Pending email invitations</Text>
          {#each pendingInvites as invite (invite.id)}
            <div class="mt-2 flex items-center gap-2">
              <Text class="grow" size="small">{invite.email}</Text>
              <button class="text-sm text-immich-primary underline" type="button" onclick={() => revokePendingInvite(invite)}
                >Revoke</button
              >
            </div>
          {/each}
        </div>
      {/if}
      <input
        class="border-b-4 border-immich-bg px-6 py-2 text-2xl focus:border-immich-primary dark:border-immich-dark-gray dark:focus:border-immich-dark-primary"
        placeholder={$t('search')}
        bind:value={search}
        use:initInput
      />
      {#each filteredUsers as user (user.id)}
        <ListButton selected={selectedUsers.has(user.id)} onclick={() => handleToggle(user)}>
          <UserAvatar {user} size="md" />
          <div class="grow text-start">
            <Text fontWeight="medium">{user.name}</Text>
            <Text size="tiny" color="muted">{user.email}</Text>
          </div>
        </ListButton>
      {:else}
        <Text class="py-6">{$t('album_share_no_users')}</Text>
      {/each}
    </Stack>
  {/if}
</FormModal>
