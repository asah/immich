<script lang="ts">
  import { error } from '@sveltejs/kit';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { getTagActions } from '$lib/services/tag.service';
  import { TreeNode } from '$lib/utils/tree-utils';
  import { AssetVisibility } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  if (!data.tag) {
    error(404, 'Tag not found');
  }
  const tag = data.tag!;
  const tree = TreeNode.fromTags([tag]);
  const node = tree.traverse(tag.value);
  const { Update, Delete } = $derived(getTagActions($t, node));
</script>

<UserPageLayout title={tag.name} descriptionHtml={tag.description ?? undefined} actions={[Update, Delete]}>
  <Timeline
    enableRouting={true}
    options={{ tagId: tag.id, visibility: AssetVisibility.Timeline, withPartners: true, withStacked: true }}
    assetInteraction={assetMultiSelectManager}
    withStacked
  />
</UserPageLayout>
