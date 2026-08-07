<script lang="ts">
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { AssetVisibility } from '@immich/sdk';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const options = $derived({
    tagId: data.tag.id,
    visibility: AssetVisibility.Timeline,
    withPartners: true,
    withStacked: true,
  });
</script>

<UserPageLayout
  title={data.tag.name}
  description={(data.tag as typeof data.tag & { description?: string }).description}
>
  <Timeline enableRouting={true} {options} assetInteraction={assetMultiSelectManager} withStacked />
</UserPageLayout>
