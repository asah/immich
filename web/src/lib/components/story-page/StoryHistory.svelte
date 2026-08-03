<script lang="ts">
  import type { StoryRevisionResponseDto } from '$lib/services/story.service';
  import { Button, Input } from '@immich/ui';
  import { t } from 'svelte-i18n';
  let {
    revisions,
    canRestore,
    onRestore,
    onName,
    onVisit,
  }: {
    revisions: StoryRevisionResponseDto[];
    canRestore: boolean;
    onRestore: (id: string) => void;
    onName: (id: string, name: string | null) => void;
    onVisit: (id: string) => void;
  } = $props();
</script>

<section aria-labelledby="story-history-title" class="space-y-3">
  <h2 id="story-history-title" class="font-semibold text-dark">{$t('story_history')}</h2>
  <ol class="space-y-2">
    {#each revisions as revision (revision.id)}
      <li class="rounded-xl border p-3 text-sm">
        <div class="flex justify-between gap-3">
          <strong>{revision.name || revision.summary}</strong><span
            >{new Date(revision.createdAt).toLocaleString()}</span
          >
        </div>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-gray-500">
          <span>#{revision.revision} · {revision.source}</span>{#if canRestore}<div class="flex gap-1">
              <Button size="small" variant="ghost" onclick={() => onVisit(revision.id)}
                >{$t('story_view_revision')}</Button
              ><Input
                aria-label={$t('story_revision_name')}
                value={revision.name ?? ''}
                placeholder={$t('story_revision_name')}
                onchange={(event) => onName(revision.id, event.currentTarget.value.trim() || null)}
              /><Button size="small" variant="ghost" onclick={() => onRestore(revision.id)}>{$t('restore')}</Button>
            </div>{/if}
        </div>
      </li>
    {/each}
  </ol>
</section>
