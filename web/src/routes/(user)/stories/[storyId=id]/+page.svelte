<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import StoryCurationShell, { type CurationItem } from '$lib/components/story-page/StoryCurationShell.svelte';
  import StoryHistory from '$lib/components/story-page/StoryHistory.svelte';
  import StoryShareModal from '$lib/components/story-page/StoryShareModal.svelte';
  import StoryAiSetup from '$lib/components/story-page/StoryAiSetup.svelte';
  import StoryCollaborators from '$lib/components/story-page/StoryCollaborators.svelte';
  import { StoryEditorCanvas, StoryPageViewport } from '$lib/components/stories';
  import StoryAiAssistant from '$lib/components/stories/StoryAiAssistant.svelte';
  import type { StoryAiConsent, StoryAiState } from '$lib/utils/story-ai-state';
  import type { StoryAspectRatio, StoryScene } from '$lib/utils/story-model';
  import { createBlankStoryPageCommand, createStoryPageMoveCommand } from '$lib/utils/story-page-actions';
  import { Route } from '$lib/route';
  import AlbumPickerModal from '$lib/modals/AlbumPickerModal.svelte';
  import { storyService, type StoryCommandBatchDto } from '$lib/services/story.service';
  import {
    LocalStorageStoryRecoveryStore,
    StoryEditorTransactionManager,
    type StoryCommandBatch,
  } from '$lib/utils/story-editor-state';
  import { Badge, Button, modalManager, toastManager } from '@immich/ui';
  import { getAssetInfo, getAssetThumbnailPath, getBaseUrl } from '@immich/sdk';
  import type { StoryAiConsentResponseDto, StoryAiProviderResponseDto } from '@immich/sdk';
  import { mdiPlay, mdiPublish, mdiShareVariant } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let tab = $state('pages');
  let sceneIndex = $state(-1);
  let mobileSurface = $state<'pages' | 'canvas' | 'details'>('canvas');
  let aiState = $state<StoryAiState>({ state: 'idle' });
  const loadedAiProvider = data.aiProvider as StoryAiProviderResponseDto | undefined;
  const loadedAiConsent = data.aiConsent as StoryAiConsentResponseDto | undefined;
  let aiConsent = $state<StoryAiConsent | undefined>(
    loadedAiConsent && loadedAiProvider
      ? {
          providerFingerprint: loadedAiProvider.credentialFingerprint ?? loadedAiProvider.id,
          textAllowed: loadedAiConsent.textAllowed,
          thumbnailsAllowed: loadedAiConsent.thumbnailAllowed,
          decidedAt: loadedAiConsent.updatedAt,
        }
      : undefined,
  );
  let collaborators = $state(data.collaborators);
  let showAiSetup = $state(false);
  let preparedPrompt = $state('');
  onMount(() => {
    const key = `immich-story-ai-prompt-${data.story.id}`;
    preparedPrompt = sessionStorage.getItem(key) ?? '';
  });
  const aiProvider = $derived(data.aiProvider as StoryAiProviderResponseDto | undefined);
  const canEdit = $derived(data.story.role !== 'viewer');
  const isOwner = $derived(data.story.role === 'owner');
  const scenes = $derived([data.document.document.cover, ...data.document.document.pages]);
  const scene = $derived(scenes[sceneIndex + 1]);
  const viewScene = $derived({ ...scene, template: 'blank' } as unknown as StoryScene);
  const viewAspectRatio = $derived(
    ({ portrait_4_5: 'portrait-4:5', landscape_16_9: 'landscape-16:9', square_1_1: 'square-1:1' } as const)[
      data.story.aspectRatio
    ] as StoryAspectRatio,
  );
  const mediaResolver = (assetId: string, kind: 'image' | 'sticker' | 'video') => ({
    imageUrl: `${getBaseUrl()}/stories/${data.story.id}/revisions/${data.document.revisionId}/assets/${assetId}/rendition`,
    posterUrl: `${getBaseUrl()}/stories/${data.story.id}/revisions/${data.document.revisionId}/assets/${assetId}/rendition`,
    videoUrl:
      kind === 'video'
        ? `${getBaseUrl()}/stories/${data.story.id}/revisions/${data.document.revisionId}/assets/${assetId}/video`
        : undefined,
  });
  const transactionManager = new StoryEditorTransactionManager<
    unknown,
    { frame: { x: number; y: number; width: number; height: number }; rotation: number }
  >({
    storyId: data.story.id,
    sessionId: crypto.randomUUID(),
    revision: data.document.revision,
    document: data.document.document,
    recovery: new LocalStorageStoryRecoveryStore(),
  });
  const synchronizeEditor = async (result: { revision: number; document: unknown }) => {
    await transactionManager.synchronize(result.revision, result.document);
    await invalidateAll();
  };
  const requireIdleEditor = () => {
    if (transactionManager.hasActiveTransaction || transactionManager.pendingBatches.length > 0) {
      throw new Error('Finish saving the current editor change first');
    }
  };
  const usedIds = new Set(
    [data.document.document.cover, ...data.document.document.pages].flatMap(({ elements }) =>
      (elements ?? []).map((item) => (item as { assetId?: string }).assetId).filter((id): id is string => !!id),
    ),
  );
  let curationItems = $state<CurationItem[]>(
    Object.entries(data.document.document.curation ?? {}).map(([id, state]) => ({
      id,
      used: usedIds.has(id),
      state,
    })),
  );
  onMount(async () => {
    const details = await Promise.all(
      curationItems.map(async (item) => {
        try {
          const asset = await getAssetInfo({ id: item.id });
          return {
            ...item,
            name: asset.originalFileName,
            thumbnailUrl: `${getBaseUrl()}${getAssetThumbnailPath(item.id)}`,
          };
        } catch {
          return item;
        }
      }),
    );
    curationItems = details;
  });
  const saveCuration = async (items: CurationItem[]) => {
    try {
      requireIdleEditor();
      const result = await storyService.setCuration(
        data.story.id,
        data.document.revision,
        items.map(({ id, state }) => ({ assetId: id, state })),
      );
      await synchronizeEditor(result);
    } catch (error) {
      toastManager.danger($t('story_save_error'));
      throw error;
    }
  };
  const placeAsset = async (assetId: string) => {
    try {
      requireIdleEditor();
      const result = await storyService.placeAsset(data.story.id, assetId);
      await synchronizeEditor(result);
    } catch (error) {
      toastManager.danger($t('story_save_error'));
      throw error;
    }
  };
  const addMedia = async () => {
    const albums = await modalManager.show(AlbumPickerModal);
    if (!albums?.length) return;
    try {
      await storyService.importAlbums(
        data.story.id,
        albums.map(({ id }) => id),
      );
      await invalidateAll();
    } catch {
      toastManager.danger($t('story_save_error'));
    }
  };
  const applyBatch = async (batch: StoryCommandBatch) => {
    try {
      const result = await storyService.apply(data.story.id, {
        baseRevision: batch.baseRevision,
        clientMutationId: batch.clientMutationId,
        sessionId: batch.clientSessionId,
        clientSequence: batch.clientSequence,
        commands: batch.commands as StoryCommandBatchDto['commands'],
      });
      await transactionManager.acknowledge(batch.clientMutationId, result.revision, result.document);
      await invalidateAll();
    } catch {
      toastManager.danger($t('story_save_error'));
    }
  };
  const publish = async () => {
    await storyService.publish(data.story.id);
    await invalidateAll();
  };
  const restore = async (revisionId: string) => {
    requireIdleEditor();
    const result = await storyService.restore(data.story.id, revisionId);
    await synchronizeEditor(result);
  };
  const nameRevision = async (revisionId: string, name: string | null) => {
    await storyService.nameRevision(data.story.id, revisionId, name);
    await invalidateAll();
  };
  const visitRevision = (revisionId: string) => goto(Route.viewStoryPlayer(data.story, { revisionId }));
  const provider = $derived(
    aiProvider
      ? {
          state: 'ready' as const,
          providerName: aiProvider.adapter,
          modelName: aiProvider.model,
          billing: aiProvider.scope === 'server' ? ('server' as const) : ('user' as const),
        }
      : { state: 'setup-required' as const },
  );
  const saveAiConsent = async ({
    textAllowed,
    thumbnailsAllowed,
  }: {
    textAllowed: boolean;
    thumbnailsAllowed: boolean;
  }) => {
    if (!aiProvider) return;
    const saved = await storyService.aiConsent(aiProvider.id, textAllowed, thumbnailsAllowed);
    aiConsent = {
      providerFingerprint: aiProvider.credentialFingerprint ?? aiProvider.id,
      textAllowed: saved.textAllowed,
      thumbnailsAllowed: saved.thumbnailAllowed,
      decidedAt: saved.updatedAt,
    };
  };
  const requestAiDraft = async (actionId: string) => {
    if (actionId === '__discard-prepared-prompt__') {
      sessionStorage.removeItem(`immich-story-ai-prompt-${data.story.id}`);
      preparedPrompt = '';
      return;
    }
    aiState = { state: 'working', actionLabel: actionId };
    try {
      const draft = await storyService.aiDraft(data.story.id, data.document.revision, actionId);
      if (preparedPrompt && actionId === preparedPrompt) {
        sessionStorage.removeItem(`immich-story-ai-prompt-${data.story.id}`);
        preparedPrompt = '';
      }
      aiState = {
        state: 'preview',
        draft: {
          id: draft.id,
          contentHash: draft.id,
          baseRevision: draft.baseRevision,
          expiresAt: draft.expiresAt,
          commands: draft.commands,
          diff: {
            summary: String(draft.diff.summary ?? 'AI proposed story changes'),
            affectedPageIds: (draft.diff.affectedPageIds as string[] | undefined) ?? [],
            changes:
              (draft.diff.changes as Array<{ kind: 'add' | 'change' | 'remove'; label: string }> | undefined) ?? [],
          },
        },
      };
    } catch {
      aiState = { state: 'error', message: $t('story_ai_error') };
    }
  };
  const applyAi = async (draftId: string) => {
    if (aiState.state !== 'preview') return;
    aiState = { state: 'applying', draft: aiState.draft };
    try {
      requireIdleEditor();
      const result = await storyService.applyAiDraft(data.story.id, draftId);
      aiState = { state: 'idle' };
      await synchronizeEditor(result);
    } catch {
      aiState = { state: 'error', message: $t('story_ai_error') };
    }
  };
  const discardAi = async (draftId: string) => {
    await storyService.discardAiDraft(data.story.id, draftId);
    aiState = { state: 'idle' };
  };
  const share = () => modalManager.show(StoryShareModal, { storyId: data.story.id, pageId: scene.id, offsetMs: 0 });
  const applyPageCommands = async (commands: StoryCommandBatch['commands']) => {
    requireIdleEditor();
    const result = await storyService.apply(data.story.id, {
      baseRevision: data.document.revision,
      clientMutationId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      clientSequence: 1,
      commands: commands as StoryCommandBatchDto['commands'],
    });
    await synchronizeEditor(result);
  };
  const addPage = async () => {
    const pageId = crypto.randomUUID();
    await applyPageCommands([
      createBlankStoryPageCommand(pageId, sceneIndex < 0 ? null : data.document.document.pages[sceneIndex].id),
    ]);
    sceneIndex = sceneIndex < 0 ? 0 : sceneIndex + 1;
  };
  const removePage = async (index: number) => {
    await applyPageCommands([{ op: 'page.remove', pageId: data.document.document.pages[index].id }]);
    sceneIndex = Math.min(index, data.document.document.pages.length - 2);
  };
  const movePage = async (index: number, direction: -1 | 1) => {
    const pages = data.document.document.pages;
    await applyPageCommands([createStoryPageMoveCommand(pages, index, direction)]);
    sceneIndex = index + direction;
  };
  onMount(async () => {
    const recovery = await transactionManager.restore();
    if (recovery !== 'ready') return;
    try {
      for (const batch of transactionManager.pendingBatches) {
        const result = await storyService.apply(data.story.id, {
          baseRevision: batch.baseRevision,
          clientMutationId: batch.clientMutationId,
          sessionId: batch.clientSessionId,
          clientSequence: batch.clientSequence,
          commands: batch.commands as StoryCommandBatchDto['commands'],
        });
        await transactionManager.acknowledge(batch.clientMutationId, result.revision, result.document);
      }
      await invalidateAll();
    } catch {
      toastManager.danger($t('story_save_error'));
    }
  });
</script>

<UserPageLayout title={data.story.title} scrollbar={false}>
  {#snippet buttons()}
    <div class="flex flex-wrap items-center gap-2">
      <Badge
        >{data.story.publishedRevisionId
          ? data.story.hasUnpublishedChanges
            ? $t('story_status_unpublished_changes')
            : $t('story_status_published')
          : $t('story_status_draft')}</Badge
      >
      <Button variant="ghost" leadingIcon={mdiPlay} onclick={() => goto(Route.viewStoryPlayer(data.story))}
        >{$t('preview')}</Button
      >
      {#if isOwner}<Button
          variant="ghost"
          leadingIcon={mdiShareVariant}
          disabled={!data.story.publishedRevisionId}
          onclick={share}>{$t('share')}</Button
        ><Button leadingIcon={mdiPublish} onclick={publish}
          >{data.story.publishedRevisionId ? $t('publish_changes') : $t('publish')}</Button
        >{/if}
    </div>
  {/snippet}
  <div
    class="@container grid h-full grid-rows-[auto_1fr] overflow-hidden @5xl:grid-cols-[15rem_1fr_20rem] @5xl:grid-rows-1"
  >
    <nav
      class="col-span-full flex flex-wrap justify-center gap-2 border-b p-2 @5xl:hidden"
      aria-label={$t('story_editor_surfaces')}
    >
      <Button
        size="small"
        variant={mobileSurface === 'pages' ? 'filled' : 'ghost'}
        onclick={() => (mobileSurface = 'pages')}>{$t('story_pages')}</Button
      ><Button
        size="small"
        variant={mobileSurface === 'canvas' ? 'filled' : 'ghost'}
        onclick={() => (mobileSurface = 'canvas')}>{$t('story_canvas')}</Button
      ><Button
        size="small"
        variant={mobileSurface === 'details' ? 'filled' : 'ghost'}
        onclick={() => (mobileSurface = 'details')}>{$t('story_details')}</Button
      >
    </nav>
    <aside
      class:hidden={mobileSurface !== 'pages'}
      class="order-2 overflow-auto border-t p-3 @5xl:order-1 @5xl:block @5xl:border-t-0 @5xl:border-e"
      aria-label={$t('story_pages')}
    >
      <button
        class:font-bold={sceneIndex === -1}
        class="mb-2 w-full rounded-lg border p-3 text-start"
        onclick={() => (sceneIndex = -1)}>{$t('story_cover')}</button
      >
      {#each data.document.document.pages as page, index (page.id)}<button
          class:font-bold={sceneIndex === index}
          class="mb-2 w-full rounded-lg border p-3 text-start"
          onclick={() => (sceneIndex = index)}>{$t('story_page_number', { values: { number: index + 1 } })}</button
        >
        {#if canEdit}<div
            class="mb-2 flex flex-wrap gap-1"
            aria-label={$t('story_page_actions', { values: { number: index + 1 } })}
          >
            <Button size="small" variant="ghost" disabled={index === 0} onclick={() => movePage(index, -1)}
              >{$t('move_up')}</Button
            ><Button
              size="small"
              variant="ghost"
              disabled={index === data.document.document.pages.length - 1}
              onclick={() => movePage(index, 1)}>{$t('move_down')}</Button
            ><Button
              size="small"
              variant="ghost"
              disabled={data.document.document.pages.length === 1}
              onclick={() => removePage(index)}>{$t('delete')}</Button
            >
          </div>{/if}{/each}
      {#if canEdit}<Button size="small" variant="ghost" onclick={addPage}>{$t('story_add_page')}</Button>{/if}
    </aside>
    <main class:hidden={mobileSurface !== 'canvas'} class="order-1 min-h-0 bg-black/5 p-3 @5xl:order-2 @5xl:block">
      {#if canEdit}<StoryEditorCanvas
          scene={viewScene}
          aspectRatio={viewAspectRatio}
          {transactionManager}
          onBatch={applyBatch}
          {mediaResolver}
        />{:else}<StoryPageViewport scene={viewScene} aspectRatio={viewAspectRatio} />{/if}
    </main>
    <aside class:hidden={mobileSurface !== 'details'} class="order-3 overflow-auto border-s p-4 @5xl:block">
      <div class="flex gap-2">
        <Button size="small" variant={tab === 'pages' ? 'filled' : 'ghost'} onclick={() => (tab = 'pages')}
          >{$t('story_details')}</Button
        ><Button size="small" variant={tab === 'history' ? 'filled' : 'ghost'} onclick={() => (tab = 'history')}
          >{$t('story_history')}</Button
        >
      </div>
      <div class="mt-4">
        {#if tab === 'history'}<StoryHistory
            revisions={data.revisions}
            canRestore={canEdit}
            onRestore={restore}
            onName={nameRevision}
            onVisit={visitRevision}
          />{:else}<StoryCurationShell
            bind:items={curationItems}
            onChange={saveCuration}
            onPlace={placeAsset}
            onAddMedia={addMedia}
          />
          <p class="mt-4 text-sm text-gray-500">{$t('story_editor_shell_hint')}</p>{/if}
      </div>
      <div class="mt-6 border-t pt-4">
        <StoryAiAssistant
          {provider}
          consent={aiConsent}
          providerFingerprint={aiProvider?.credentialFingerprint ?? aiProvider?.id}
          {aiState}
          actions={[
            ...(preparedPrompt
              ? [
                  { id: preparedPrompt, label: $t('story_ai_use_description'), description: preparedPrompt },
                  {
                    id: '__discard-prepared-prompt__',
                    label: $t('story_ai_discard_description'),
                    description: $t('story_ai_discard_description_hint'),
                  },
                ]
              : []),
            { id: 'improve-layout', label: $t('story_ai_improve'), description: $t('story_ai_improve_description') },
          ]}
          onSaveConsent={saveAiConsent}
          onAction={requestAiDraft}
          onApply={applyAi}
          onDiscard={discardAi}
          onSetup={() => (showAiSetup = true)}
        />
        {#if showAiSetup}<StoryAiSetup
            onSaved={async () => {
              showAiSetup = false;
              await invalidateAll();
            }}
          />{/if}
      </div>
      <StoryCollaborators storyId={data.story.id} bind:users={collaborators} canManage={isOwner} />
    </aside>
  </div>
</UserPageLayout>
