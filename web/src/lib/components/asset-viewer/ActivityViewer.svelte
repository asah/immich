<script lang="ts">
  import RichTextEditor from '$lib/components/shared-components/RichTextEditor.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { getAssetType } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { reactionEmoji } from '$lib/utils/reaction-emoji';
  import { isTenMinutesApart } from '$lib/utils/timesince';
  import {
    searchAssets,
    type ActivityResponseDto,
    type AlbumUserResponseDto,
    type AssetResponseDto,
    type AssetTypeEnum,
    ReactionType,
  } from '@immich/sdk';
  import { Button, IconButton, Input, LoadingSpinner, toastManager } from '@immich/ui';
  import { mdiClose, mdiDeleteOutline, mdiDotsVertical, mdiSend } from '@mdi/js';
  import * as luxon from 'luxon';
  import { t } from 'svelte-i18n';
  import UserAvatar from '../shared-components/UserAvatar.svelte';
  import ReactionPicker from './ReactionPicker.svelte';
  import { fileUploadHandler } from '$lib/utils/file-uploader';

  const units: Intl.RelativeTimeFormatUnit[] = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'];

  const shouldGroup = (currentDate: string, nextDate: string): boolean => {
    const currentDateTime = luxon.DateTime.fromISO(currentDate, { locale: $locale });
    const nextDateTime = luxon.DateTime.fromISO(nextDate, { locale: $locale });

    return currentDateTime.hasSame(nextDateTime, 'hour') || currentDateTime.toRelative() === nextDateTime.toRelative();
  };

  const timeSince = (dateTime: luxon.DateTime) => {
    const diff = dateTime.diffNow().shiftTo(...units);
    const unit = units.find((unit) => diff.get(unit) !== 0) || 'second';

    const relativeFormatter = new Intl.RelativeTimeFormat($locale, {
      numeric: 'auto',
    });
    return relativeFormatter.format(Math.trunc(diff.as(unit)), unit);
  };

  interface Props {
    assetId?: string | undefined;
    albumId: string;
    assetType?: AssetTypeEnum | undefined;
    albumUsers: AlbumUserResponseDto[];
    disabled: boolean;
  }

  let { assetId = undefined, albumId, assetType = undefined, albumUsers, disabled }: Props = $props();

  let innerHeight: number = $state(0);
  let activityHeight: number = $state(0);
  let chatHeight: number = $state(0);
  let divHeight = $derived(innerHeight - activityHeight);
  let previousAssetId: string | undefined = $state(assetId);
  let message = $state('');
  let attachedAssets = $state<AssetResponseDto[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<AssetResponseDto[]>([]);
  let showAssetSearch = $state(false);
  let isSearchingAssets = $state(false);
  let linkedCommentScrolled = $state(false);
  let isSendingMessage = $state(false);
  const isAlbumOwner = $derived(albumUsers[0].user.id === authManager.user.id);

  const timeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  const handleDeleteReaction = async (reaction: ActivityResponseDto, index: number) => {
    try {
      await activityManager.deleteActivity(reaction, index);

      const deleteMessages: Record<ReactionType, string> = {
        [ReactionType.Comment]: $t('comment_deleted'),
        [ReactionType.Like]: $t('like_deleted'),
      };
      toastManager.primary(deleteMessages[reaction.type]);
    } catch (error) {
      handleError(error, $t('errors.unable_to_remove_reaction'));
    }
  };

  const copyCommentLink = async (reaction: ActivityResponseDto) => {
    const targetAssetId = reaction.assetId ?? assetId;
    if (!targetAssetId) {
      return;
    }

    const link = new URL(Route.viewAlbumAsset({ albumId, assetId: targetAssetId }), window.location.origin);
    link.searchParams.set('comment', reaction.id);
    await navigator.clipboard.writeText(link.toString());
    toastManager.primary('Comment link copied');
  };

  const handleSendComment = async () => {
    if (!message) {
      return;
    }
    const timeout = setTimeout(() => (isSendingMessage = true), timeBeforeShowLoadingSpinner);
    try {
      await activityManager.addActivity({
        albumId,
        assetId,
        type: ReactionType.Comment,
        comment: message.replace(/<[^>]+>/g, ' ').trim(),
        commentDocument: message,
        assetIds: attachedAssets.map(({ id }) => id),
      });

      message = '';
      attachedAssets = [];
      showAssetSearch = false;
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_comment'));
    } finally {
      clearTimeout(timeout);
    }
    isSendingMessage = false;
  };

  const reactTo = async (reaction: ActivityResponseDto, reactionKey: string) => {
    await activityManager.addActivity({
      albumId,
      assetId: reaction.assetId ?? undefined,
      type: ReactionType.Like,
      reactionKey,
      parentActivityId: reaction.id,
    });
  };

  const searchForAssets = async () => {
    isSearchingAssets = true;
    try {
      const response = await searchAssets({
        metadataSearchDto: { size: 20, page: 1, originalFileName: searchQuery.trim() || undefined },
      });
      searchResults = response.assets.items;
    } finally {
      isSearchingAssets = false;
    }
  };

  const addAttachment = (asset: AssetResponseDto) => {
    if (attachedAssets.some(({ id }) => id === asset.id)) {
      attachedAssets = attachedAssets.filter(({ id }) => id !== asset.id);
    } else if (attachedAssets.length < 4) {
      attachedAssets = [...attachedAssets, asset];
    }
  };

  const focusCommentEditor = () => {
    document.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  };

  const handleAssetSearchKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void searchForAssets();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      showAssetSearch = false;
      focusCommentEditor();
    }
    event.stopPropagation();
  };

  const uploadAttachments = async () => {
    const ids = await fileUploadHandler({
      files: await new Promise<File[]>((resolve) => {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.multiple = true;
        picker.accept = 'image/*,video/*';
        picker.onchange = () => resolve(Array.from(picker.files ?? []));
        picker.click();
      }),
      albumId,
    });
    if (ids.length) {
      const uploaded = ids.map((id) => ({ id }) as AssetResponseDto);
      attachedAssets = [...attachedAssets, ...uploaded].slice(0, 4);
    }
  };

  $effect(() => {
    if (assetId && previousAssetId != assetId) {
      previousAssetId = assetId;
    }
  });

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await handleSendComment();
  };

  $effect(() => {
    const commentId = new URLSearchParams(window.location.search).get('comment');
    if (!commentId || linkedCommentScrolled || !activityManager.activities.length || !innerHeight) {
      return;
    }

    const comment = document.getElementById(`comment-${commentId}`);
    if (comment) {
      comment.scrollIntoView({ block: 'center' });
      comment.classList.add('ring-2', 'ring-primary');
      linkedCommentScrolled = true;
    }
  });
</script>

<div class="relative h-full overflow-y-hidden border-l border-subtle bg-subtle" bind:offsetHeight={innerHeight}>
  <div class="size-full">
    <div class="flex h-fit w-full bg-subtle p-2 dark:text-immich-dark-fg" bind:clientHeight={activityHeight}>
      <div class="flex place-items-center gap-2">
        <IconButton
          shape="round"
          variant="ghost"
          color="secondary"
          onclick={() => assetViewerManager.closeActivityPanel()}
          icon={mdiClose}
          aria-label={$t('close')}
        />

        <p class="text-lg text-immich-fg dark:text-immich-dark-fg">{$t('activity')}</p>
      </div>
    </div>
    {#if innerHeight}
      <div
        class="relative w-full immich-scrollbar overflow-y-auto px-2"
        style="height: {divHeight}px;padding-bottom: {chatHeight}px"
      >
        {#each activityManager.activities as reaction, index (reaction.id)}
          {#if reaction.type === ReactionType.Comment}
            <div
              id={`comment-${reaction.id}`}
              class="mt-3 flex justify-start gap-4 rounded-lg bg-gray-200 py-3 ps-3 dark:bg-gray-800"
            >
              <div class="flex items-center">
                <UserAvatar user={reaction.user} size="sm" />
              </div>

              <div class="w-full self-center overflow-hidden text-sm/4 wrap-break-word">
                {@html reaction.commentDocument || reaction.comment || ''}
                <div class="mt-2 flex items-center gap-1">
                  <ReactionPicker
                    selectedEmoji="＋"
                    buttonLabel="React to comment"
                    onSelect={({ key }) => reactTo(reaction, key)}
                  />
                  {#each activityManager.activities.filter((item) => item.parentActivityId === reaction.id) as reply (reply.id)}
                    <span title={reply.reactionKey ?? 'reaction'}
                      >{reactionEmoji[reply.reactionKey ?? 'like'] ?? '😀'}</span
                    >
                  {/each}
                </div>
              </div>
              {#each reaction.assetIds ?? [] as attachedId (attachedId)}
                <a
                  class="aspect-square size-12"
                  href={Route.viewAlbumAsset({ albumId, assetId: attachedId })}
                  title="Open referenced photo"
                >
                  <img class="size-12 rounded-lg object-cover" src={getAssetMediaUrl({ id: attachedId })} alt="" />
                </a>
              {/each}
              {#if assetId === undefined && reaction.assetId}
                <a class="aspect-square size-19" href={Route.viewAlbumAsset({ albumId, assetId: reaction.assetId })}>
                  <img
                    class="size-19 rounded-lg object-cover"
                    src={getAssetMediaUrl({ id: reaction.assetId })}
                    alt="Profile picture of {reaction.user.name}, who commented on this asset"
                  />
                </a>
              {/if}
              {#if reaction.user.id === authManager.user.id || isAlbumOwner}
                <div class="me-4">
                  <ButtonContextMenu
                    icon={mdiDotsVertical}
                    title={$t('comment_options')}
                    align="top-right"
                    direction="left"
                    size="small"
                  >
                    <MenuOption
                      activeColor="bg-red-200"
                      icon={mdiDeleteOutline}
                      text={$t('remove')}
                      onClick={() => handleDeleteReaction(reaction, index)}
                    />
                    <MenuOption
                      text="Copy link to comment"
                      subtitle={new Date(reaction.createdAt).toLocaleString(undefined, timeOptions)}
                      onClick={() => copyCommentLink(reaction)}
                    />
                  </ButtonContextMenu>
                </div>
              {:else}
                <div class="me-4">
                  <ButtonContextMenu
                    icon={mdiDotsVertical}
                    title={$t('comment_options')}
                    align="top-right"
                    direction="left"
                    size="small"
                  >
                    <MenuOption
                      text="Copy link to comment"
                      subtitle={new Date(reaction.createdAt).toLocaleString(undefined, timeOptions)}
                      onClick={() => copyCommentLink(reaction)}
                    />
                  </ButtonContextMenu>
                </div>
              {/if}
            </div>

            {#if (index != activityManager.activities.length - 1 && !shouldGroup(activityManager.activities[index].createdAt, activityManager.activities[index + 1].createdAt)) || index === activityManager.activities.length - 1}
              <div
                class="w-full px-2 pt-1 text-right text-sm text-gray-500 dark:text-gray-300"
                title={new Date(reaction.createdAt).toLocaleDateString(undefined, timeOptions)}
              >
                {timeSince(luxon.DateTime.fromISO(reaction.createdAt, { locale: $locale }))}
              </div>
            {/if}
          {:else if reaction.type === ReactionType.Like}
            <div class="relative">
              <div class="mt-3 flex items-center gap-4 py-3 ps-3 text-sm">
                <div class="text-primary text-xl">
                  {reactionEmoji[reaction.reactionKey ?? 'like'] ?? '😀'}
                </div>

                <div class="w-full" title={`${reaction.user.name} (${reaction.user.email})`}>
                  {$t('user_reacted', {
                    values: {
                      user: reaction.user.name,
                      type: assetType ? getAssetType(assetType).toLowerCase() : null,
                    },
                  })}
                </div>
                {#if assetId === undefined && reaction.assetId}
                  <a class="aspect-square size-19" href={Route.viewAlbumAsset({ albumId, assetId: reaction.assetId })}>
                    <img
                      class="size-19 rounded-lg object-cover"
                      src={getAssetMediaUrl({ id: reaction.assetId })}
                      alt="Profile picture of {reaction.user.name}, who reacted to this asset"
                    />
                  </a>
                {/if}
                {#if reaction.user.id === authManager.user.id || isAlbumOwner}
                  <div class="me-4">
                    <ButtonContextMenu
                      icon={mdiDotsVertical}
                      title={$t('reaction_options')}
                      align="top-right"
                      direction="left"
                      size="small"
                    >
                      <MenuOption
                        activeColor="bg-red-200"
                        icon={mdiDeleteOutline}
                        text={$t('remove')}
                        onClick={() => handleDeleteReaction(reaction, index)}
                      />
                    </ButtonContextMenu>
                  </div>
                {/if}
              </div>
              {#if (index != activityManager.activities.length - 1 && isTenMinutesApart(activityManager.activities[index].createdAt, activityManager.activities[index + 1].createdAt)) || index === activityManager.activities.length - 1}
                <div
                  class="w-full px-2 pt-1 text-right text-sm text-gray-500 dark:text-gray-300"
                  title={new Date(reaction.createdAt).toLocaleDateString(navigator.language, timeOptions)}
                >
                  {timeSince(luxon.DateTime.fromISO(reaction.createdAt, { locale: $locale }))}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <div class="absolute bottom-0 w-full">
    <div class="flex flex-col gap-2 p-2" bind:clientHeight={chatHeight}>
      {#if showAssetSearch}
        <div class="rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
          <div class="flex gap-2">
            <Input
              bind:value={searchQuery}
              placeholder="Search photos to reference"
              onkeydown={handleAssetSearchKeydown}
            />
            <Button size="small" onclick={searchForAssets}>Search</Button>
          </div>
          {#if isSearchingAssets}
            <LoadingSpinner size="small" />
          {:else}
            {#if searchResults.length === 0}
              <p class="mt-2 text-sm text-gray-500" role="status">No results</p>
            {:else}
              <div class="mt-2 grid grid-cols-5 gap-1">
                {#each searchResults as result (result.id)}
                  {@const isAttached = attachedAssets.some(({ id }) => id === result.id)}
                  <button
                    type="button"
                    class:rounded={isAttached}
                    class:ring-2={isAttached}
                    class:ring-immich-primary={isAttached}
                    aria-pressed={isAttached}
                    aria-label={isAttached ? `Remove ${result.originalFileName}` : `Add ${result.originalFileName}`}
                    onclick={() => addAttachment(result)}
                  >
                    <img
                      class="size-12 rounded object-cover"
                      src={getAssetMediaUrl({ id: result.id })}
                      alt={result.originalFileName}
                    />
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/if}
      <div
        class="rounded-2xl border border-gray-300 bg-gray-100 p-2 text-immich-dark-gray dark:border-gray-700 dark:bg-gray-800"
      >
        <form class="flex max-h-64 w-full flex-col gap-2" {onsubmit}>
          <RichTextEditor bind:value={message} label="" />
          {#if attachedAssets.length}
            <div class="flex gap-1 overflow-x-auto">
              {#each attachedAssets as attached (attached.id)}
                <img
                  class="size-12 rounded object-cover"
                  src={getAssetMediaUrl({ id: attached.id })}
                  alt={attached.originalFileName ?? 'Attached photo'}
                />
              {/each}
            </div>
          {/if}
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1">
              <Button
                type="button"
                size="small"
                variant="ghost"
                disabled={attachedAssets.length >= 4}
                onclick={uploadAttachments}
                aria-label="Upload photos">📎</Button
              >
              <Button
                type="button"
                size="small"
                variant="ghost"
                onclick={() => (showAssetSearch = !showAssetSearch)}
                aria-label="Search photos">🔎</Button
              >
            </div>
            {#if isSendingMessage}
              <LoadingSpinner size="large" />
            {:else if message}
              <IconButton
                shape="round"
                aria-label={$t('send_message')}
                variant="ghost"
                icon={mdiSend}
                onclick={() => handleSendComment()}
              />
            {/if}
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<style>
  ::placeholder {
    color: rgb(60, 60, 60);
    opacity: 0.6;
  }

  ::-ms-input-placeholder {
    /* Edge 12 -18 */
    color: white;
  }
</style>
