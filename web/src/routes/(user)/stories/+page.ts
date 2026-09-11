import { storyService } from '$lib/services/story.service';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const stories = await storyService.list();
  return { stories, meta: { title: 'Stories' } };
}) satisfies PageLoad;
