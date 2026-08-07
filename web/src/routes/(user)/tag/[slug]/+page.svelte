<script lang="ts">
  import { error } from '@sveltejs/kit';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { AssetVisibility } from '@immich/sdk';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  if (!data.tag) {
    error(404, 'Tag not found');
  }
  const tag = data.tag!;
</script>

<UserPageLayout title={tag.name} description={tag.description ?? undefined}>
  <Timeline
    enableRouting={true}
    options={{ tagId: tag.id, visibility: AssetVisibility.Timeline, withPartners: true, withStacked: true }}
    assetInteraction={assetMultiSelectManager}
    withStacked
  />
</UserPageLayout>
