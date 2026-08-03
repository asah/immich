<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import StoryCard from '$lib/components/story-page/StoryCard.svelte';
  import { Route } from '$lib/route';
  import { Button } from '@immich/ui';
  import { mdiPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<UserPageLayout title={data.meta.title}>
  {#snippet buttons()}<Button href={Route.newStory()} leadingIcon={mdiPlus}>{$t('create_story')}</Button>{/snippet}
  {#if data.stories.length === 0}
    <EmptyPlaceholder
      class="mx-auto mt-16"
      title={$t('story_empty_title')}
      text={$t('story_empty_description')}
      onClick={() => location.assign(Route.newStory())}
    />
  {:else}
    <section
      aria-label={$t('stories')}
      class="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    >
      {#each data.stories as story (story.id)}<StoryCard {story} />{/each}
    </section>
  {/if}
</UserPageLayout>
