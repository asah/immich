import { storyService } from '$lib/services/story.service';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  await authenticate(url);
  const [detail, aiProvider, aiConsent, collaborators] = await Promise.all([
    storyService.detail(params.storyId),
    storyService.aiProvider().catch(() => undefined),
    storyService.getAiConsent().catch(() => undefined),
    storyService.collaborators(params.storyId),
  ]);
  return { ...detail, aiProvider, aiConsent, collaborators };
}) satisfies PageLoad;
