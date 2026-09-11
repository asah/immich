<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import {
    getAlbumVotingLeaderboard,
    getAlbumVotingSession,
    voteForAlbum,
    AssetMediaSize,
    type AlbumResponseDto,
    type AlbumVoteLeaderboardDto,
    type AlbumVoteSessionDto,
  } from '@immich/sdk';
  import { Button, Icon, Modal, ModalBody } from '@immich/ui';
  import { mdiMagnifyPlus } from '@mdi/js';
  import { onMount } from 'svelte';

  type Props = { album: AlbumResponseDto; backHref: string; key?: string; slug?: string };
  let { album, backHref, key, slug }: Props = $props();
  let session = $state<AlbumVoteSessionDto>();
  let leaderboard = $state<AlbumVoteLeaderboardDto>();
  let showLeaderboard = $state(false);
  let busyAssetId = $state<string>();
  let zoomedAssetId = $state<string>();
  let detailZoom = $state(1);

  const isWorthZooming = (width: number | null, height: number | null) => Math.max(width ?? 0, height ?? 0) >= 1920;
  const openZoom = (assetId: string) => {
    zoomedAssetId = assetId;
    detailZoom = 1;
  };

  const load = async () => {
    session = await getAlbumVotingSession({ id: album.id, key, slug });
  };

  const vote = async (assetId: string, value: -1 | 1 | null) => {
    busyAssetId = assetId;
    try {
      await voteForAlbum({ id: album.id, assetId, key, slug, albumVoteDto: { value } });
      await load();
    } finally {
      busyAssetId = undefined;
    }
  };

  const openLeaderboard = async () => {
    leaderboard = await getAlbumVotingLeaderboard({ id: album.id, key, slug });
    showLeaderboard = true;
  };

  onMount(() => void load());
</script>

<main
  class="min-h-dvh bg-immich-bg px-4 pt-8 pb-28 text-immich-fg dark:bg-immich-dark-bg dark:text-immich-dark-fg sm:px-8"
>
  <div class="mx-auto max-w-5xl">
    <a class="text-sm font-medium text-primary hover:underline" href={backHref}>← Back to album</a>
    <h1 class="mt-5 text-3xl font-bold">Help choose this album’s favorites</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Tap photos you love. Skip anything you’re unsure about.</p>

    {#if session}
      <p class="mt-4 text-sm font-medium">
        {session.submittedCount} rated · rate {Math.max(0, session.requiredCount - session.submittedCount)} more to unlock
        the full results
      </p>
      <div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each session.candidates as candidate (candidate.assetId)}
          <article class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-immich-dark-gray">
            <div
              class="relative grid max-h-[70dvh] min-h-48 place-items-center bg-black"
              style:aspect-ratio={candidate.width && candidate.height
                ? `${candidate.width} / ${candidate.height}`
                : undefined}
            >
              <img
                class="max-h-[70dvh] w-full object-contain"
                src={getAssetMediaUrl({ id: candidate.assetId, size: AssetMediaSize.Preview })}
                alt="Rate this"
                loading="lazy"
              />
              {#if isWorthZooming(candidate.width, candidate.height)}
                <button
                  type="button"
                  class="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
                  onclick={() => openZoom(candidate.assetId)}
                  title="Inspect detail at full size"><Icon icon={mdiMagnifyPlus} size="16" /> Zoom for detail</button
                >
              {/if}
            </div>
            <div class="flex items-center gap-2 p-3">
              <Button
                size="small"
                color={candidate.value === 1 ? 'primary' : 'secondary'}
                disabled={busyAssetId === candidate.assetId}
                onclick={() => vote(candidate.assetId, candidate.value === 1 ? null : 1)}>👍 Vote</Button
              >
              <Button
                size="small"
                color="secondary"
                class={candidate.value === -1 ? 'text-red-600' : ''}
                disabled={busyAssetId === candidate.assetId}
                onclick={() => vote(candidate.assetId, candidate.value === -1 ? null : -1)}>👎 Not for me</Button
              >
              {#if candidate.value}
                <button
                  type="button"
                  class="ms-auto text-sm text-gray-500 hover:underline"
                  onclick={() => vote(candidate.assetId, null)}>Clear</button
                >
              {/if}
            </div>
          </article>
        {/each}
      </div>
      {#if session.leaderboardVisible}
        {@const remainingRatings = Math.max(0, session.requiredCount - session.submittedCount)}
        <div
          class="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-immich-dark-bg/95"
        >
          <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-8">
            <Button color="secondary" disabled={remainingRatings > 0} onclick={openLeaderboard}>
              {remainingRatings > 0
                ? `Rate ${remainingRatings} more to reveal community favorites`
                : 'See community favorites'}
            </Button>
            <a class="text-sm font-medium text-primary hover:underline" href={backHref}>Back to album</a>
          </div>
        </div>
      {/if}
    {:else}
      <p class="mt-8">Loading your voting set…</p>
    {/if}
  </div>
</main>

{#if showLeaderboard && leaderboard}
  <Modal title="Community favorites" size="giant" onClose={() => (showLeaderboard = false)}>
    <ModalBody>
      <p class="text-sm text-gray-500">Based on {leaderboard.voters} voters</p>
      <ol class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {#each leaderboard.items.slice(0, 12) as item, index (item.assetId)}
          <li>
            <div class="grid h-36 place-items-center rounded-lg bg-black">
              <img
                class="h-full w-full object-contain"
                src={getAssetMediaUrl({ id: item.assetId })}
                alt={`Favorite ${index + 1}`}
              />
            </div>
            <p class="mt-1 text-sm">#{index + 1} · {item.positiveVotes} votes</p>
          </li>
        {/each}
      </ol>
    </ModalBody>
  </Modal>
{/if}

{#if zoomedAssetId}
  <Modal title="Inspect detail" size="giant" onClose={() => (zoomedAssetId = undefined)}>
    <ModalBody>
      <div class="flex justify-end pb-3">
        <Button size="small" color="secondary" onclick={() => (detailZoom = detailZoom === 1 ? 2 : 1)}>
          {detailZoom === 1 ? 'Zoom ×2' : 'Fit to screen'}
        </Button>
      </div>
      <div class="max-h-[70dvh] overflow-auto rounded-lg bg-black">
        <img
          class="block max-w-none"
          style:width={`${detailZoom * 100}%`}
          src={getAssetMediaUrl({ id: zoomedAssetId, size: AssetMediaSize.Original })}
          alt="Detail view"
        />
      </div>
    </ModalBody>
  </Modal>
{/if}
