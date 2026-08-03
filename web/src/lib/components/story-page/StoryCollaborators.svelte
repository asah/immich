<script lang="ts">
  import { storyService } from '$lib/services/story.service';
  import { AlbumUserRole, searchUsers, type StoryUserResponseDto, type UserResponseDto } from '@immich/sdk';
  import { Button, Select } from '@immich/ui';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  let {
    storyId,
    users = $bindable(),
    canManage = false,
  }: { storyId: string; users: StoryUserResponseDto[]; canManage?: boolean } = $props();
  let candidates = $state<UserResponseDto[]>([]);
  let selectedId = $state('');
  onMount(async () => (candidates = await searchUsers()));
  const add = async () => {
    if (!selectedId) return;
    users = await storyService.addCollaborator(storyId, selectedId, AlbumUserRole.Editor);
    selectedId = '';
  };
  const update = async (userId: string, role: AlbumUserRole) =>
    (users = await storyService.updateCollaborator(
      storyId,
      userId,
      role as AlbumUserRole.Editor | AlbumUserRole.Viewer,
    ));
  const remove = async (userId: string) => {
    await storyService.removeCollaborator(storyId, userId);
    users = users.filter((user) => user.userId !== userId);
  };
  const detail = (userId: string) => candidates.find(({ id }) => id === userId);
</script>

<section class="mt-6 border-t pt-4" aria-labelledby="story-collaborators">
  <h2 id="story-collaborators" class="font-semibold">{$t('story_collaborators')}</h2>
  {#if canManage}<div class="mt-2 flex gap-2">
      <Select
        bind:value={selectedId}
        options={[
          { label: $t('story_choose_user'), value: '' },
          ...candidates
            .filter((candidate) => !users.some(({ userId }) => userId === candidate.id))
            .map((candidate) => ({ label: `${candidate.name} · ${candidate.email}`, value: candidate.id })),
        ]}
      /><Button size="small" disabled={!selectedId} onclick={add}>{$t('add')}</Button>
    </div>{/if}
  <ul class="mt-2 space-y-2">
    {#each users as user (user.userId)}
      {@const candidate = detail(user.userId)}
      <li class="flex items-center gap-2 rounded-lg border p-2">
        {#if candidate}<UserAvatar user={candidate} size="sm" />{/if}
        <span class="min-w-0 flex-1 truncate text-sm" title={candidate?.email ?? user.userId}
          >{candidate?.name ?? candidate?.email ?? user.userId}</span
        >{#if canManage && user.role !== AlbumUserRole.Owner}<Select
            value={user.role}
            options={[
              { label: $t('role_editor'), value: AlbumUserRole.Editor },
              { label: $t('role_viewer'), value: AlbumUserRole.Viewer },
            ]}
            onChange={(role) => update(user.userId, role as AlbumUserRole)}
          /><Button size="small" variant="ghost" onclick={() => remove(user.userId)}>{$t('remove')}</Button>{:else}<span
            >{user.role}</span
          >{/if}
      </li>
    {/each}
  </ul>
</section>
