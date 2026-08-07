<script lang="ts">
import { error } from '@sveltejs/kit';
  import { goto } from '$app/navigation';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { getTagActions } from '$lib/services/tag.service';
  import { TreeNode } from '$lib/utils/tree-utils';
  import { Route } from '$lib/route';
  import { AssetVisibility } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  if (!data.tag) {
    error(404, 'Tag not found');
  }
  let tag = $state(data.tag!);
  const node = $derived(TreeNode.fromTags([tag]).traverse(tag.value));
  const { Update, Delete } = $derived(getTagActions($t, node));

  const onTagUpdate = (updated: typeof tag) => {
    if (updated.id === tag.id) {
      tag = updated;
    }
  };

  const onTagDelete = (deleted: TreeNode) => {
    if (deleted.id === tag.id) {
      void goto(Route.tags());
    }
  };
</script>

<OnEvents {onTagUpdate} {onTagDelete} />

<UserPageLayout title={tag.name} descriptionHtml={tag.description ?? undefined} actions={[Update, Delete]}>
  <Timeline
    enableRouting={true}
    options={{ tagId: tag.id, visibility: AssetVisibility.Timeline, withPartners: true, withStacked: true }}
    assetInteraction={assetMultiSelectManager}
    withStacked
  />
</UserPageLayout>
