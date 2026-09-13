<script lang="ts">
  import AlbumPage from '../../../[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte';
  let props = $props();
</script>

<AlbumPage {...props} />
