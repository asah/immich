<script lang="ts">
  import AlbumViewer from '$lib/components/album-page/AlbumViewer.svelte';
  import IndividualSharedViewer from '$lib/components/share-page/IndividualSharedViewer.svelte';
  import StoryPlaybackViewer from '$lib/components/story-page/StoryPlaybackViewer.svelte';
  import { getBaseUrl } from '@immich/sdk';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import ThemeButton from '$lib/components/shared-components/ThemeButton.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { setSharedLink } from '$lib/utils';
  import { storyService } from '$lib/services/story.service';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import { sharedLinkLogin, SharedLinkType, type AssetResponseDto, type SharedLinkResponseDto } from '@immich/sdk';
  import { Button, Logo, PasswordInput } from '@immich/ui';
  import { onDestroy, tick } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    data: {
      meta: {
        title: string;
        description?: string;
        imageUrl?: string;
      };

      sharedLink?: SharedLinkResponseDto;
      key?: string;
      slug?: string;
      asset?: AssetResponseDto;
      passwordRequired?: boolean;
      publishedStory?: import('$lib/services/story.service').SharedPublishedStoryDto;
    };
  };

  const { data }: Props = $props();

  let { sharedLink, passwordRequired, key, slug, meta, publishedStory } = $state(data);
  let { title, description } = $state(meta);
  let isOwned = $derived(authManager.authenticated && authManager.user.id === sharedLink?.userId);
  let password = $state('');
  const shareQuery = $derived(new URLSearchParams(key ? { key } : slug ? { slug } : {}).toString());

  if (passwordRequired) {
    assetViewerManager.showAssetViewer(false);
  }

  const handlePasswordSubmit = async () => {
    try {
      sharedLink = await sharedLinkLogin({ key, slug, sharedLinkLoginDto: { password } });
      setSharedLink(sharedLink);
      if ((sharedLink.type as string) === 'STORY') publishedStory = await storyService.sharedPublished({ key, slug });
      passwordRequired = false;
      title = (sharedLink.album ? sharedLink.album.albumName : $t('public_share')) + ' - Immich';
      description =
        sharedLink.description ||
        $t('shared_photos_and_videos_count', { values: { assetCount: sharedLink.assets.length } });
      await tick();
      await navigate(
        { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: assetViewerManager.gridScrollTarget },
        { forceNavigate: true, replaceState: true },
      );
    } catch (error) {
      handleError(error, $t('errors.unable_to_get_shared_link'));
    }
  };

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await handlePasswordSubmit();
  };

  onDestroy(() => {
    setSharedLink(undefined);
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>
{#if passwordRequired}
  <main
    class="relative h-dvh overflow-hidden px-6 pt-(--navbar-height) max-md:pt-(--navbar-height-md) sm:px-12 md:px-24 lg:px-40"
  >
    <div class="mt-20 flex flex-col items-center justify-center">
      <div class="text-2xl font-bold text-primary">{$t('password_required')}</div>
      <div class="mt-4 text-lg text-primary">
        {$t('sharing_enter_password')}
      </div>
      <div class="mt-4">
        <form class="flex gap-x-2" novalidate {onsubmit}>
          <PasswordInput autocomplete="off" bind:value={password} placeholder="Password" />
          <Button type="submit">{$t('submit')}</Button>
        </form>
      </div>
    </div>
  </main>
  <header>
    <ControlAppBar>
      {#snippet leading()}
        <a data-sveltekit-preload-data="hover" class="ms-4" href="/">
          <Logo variant="inline" />
        </a>
      {/snippet}

      {#snippet trailing()}
        <ThemeButton />
      {/snippet}
    </ControlAppBar>
  </header>
{/if}

{#if !passwordRequired && sharedLink?.type === SharedLinkType.Album}
  <AlbumViewer {sharedLink} />
{/if}
{#if !passwordRequired && sharedLink?.type === SharedLinkType.Individual}
  <div class="immich-scrollbar">
    <IndividualSharedViewer {sharedLink} {isOwned} />
  </div>
{/if}
{#if !passwordRequired && (sharedLink?.type as string) === 'STORY' && publishedStory}
  <main class="flex h-dvh flex-col bg-black text-white">
    <StoryPlaybackViewer
      document={publishedStory.document}
      aspectRatio={publishedStory.story.aspectRatio}
      initialPageId={publishedStory.resolvedStart?.pageId}
      initialOffsetMs={publishedStory.resolvedStart?.offsetMs ?? 0}
      autoplay={false}
      mediaResolver={(assetId, kind) => ({
        imageUrl: `${getBaseUrl()}/stories/shared/assets/${assetId}/rendition?${shareQuery}`,
        posterUrl: `${getBaseUrl()}/stories/shared/assets/${assetId}/rendition?${shareQuery}`,
        videoUrl: kind === 'video' ? `${getBaseUrl()}/stories/shared/assets/${assetId}/video?${shareQuery}` : undefined,
      })}
    />
  </main>
{/if}
