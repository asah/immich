<script lang="ts">
  import AlbumVotingPage from '$lib/components/album-page/AlbumVotingPage.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<AlbumVotingPage album={data.album} backHref={`/albums/${data.album.id}`} />
