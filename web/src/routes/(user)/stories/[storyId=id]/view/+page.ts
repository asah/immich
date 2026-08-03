import { storyService } from '$lib/services/story.service';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  await authenticate(url);
  const revisionId = url.searchParams.get('revisionId');
  const [story, document] = await Promise.all([
    storyService.get(params.storyId),
    revisionId ? storyService.revision(params.storyId, revisionId) : storyService.document(params.storyId),
  ]);
  return { story, document, historical: !!revisionId };
}) satisfies PageLoad;
