<script lang="ts">
  import { Route } from '$lib/route';
  import type { StoryResponseDto } from '$lib/services/story.service';
  import { Badge, Card, CardDescription, CardHeader, CardTitle } from '@immich/ui';
  import { t } from 'svelte-i18n';

  let { story }: { story: StoryResponseDto } = $props();
  const status = $derived(
    !story.publishedRevisionId
      ? $t('story_status_draft')
      : story.hasUnpublishedChanges
        ? $t('story_status_unpublished_changes')
        : $t('story_status_published'),
  );
</script>

<a href={Route.viewStory(story)} class="group block min-w-0">
  <Card class="h-full overflow-hidden shadow-none transition-colors group-hover:border-primary">
    <div class="flex aspect-[4/3] items-center justify-center bg-surface-container text-5xl" aria-hidden="true">📖</div>
    <CardHeader>
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="truncate group-hover:text-primary">{story.title}</CardTitle>
        <Badge>{status}</Badge>
      </div>
      <CardDescription>
        {story.description || $t('story_no_description')} · {new Date(story.updatedAt).toLocaleDateString()}
      </CardDescription>
    </CardHeader>
  </Card>
</a>
