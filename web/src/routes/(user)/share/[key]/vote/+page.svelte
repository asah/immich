<script lang="ts">
  import AlbumVotingPage from '$lib/components/album-page/AlbumVotingPage.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

{#if data.sharedLink?.album}
  <AlbumVotingPage album={data.sharedLink.album} backHref={`/share/${data.key}`} key={data.key} slug={data.slug} />
{/if}
