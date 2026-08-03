import { storyService } from '$lib/services/story.service';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const [stories, $t] = await Promise.all([storyService.list(), getFormatter()]);
  return { stories, meta: { title: $t('stories') } };
}) satisfies PageLoad;
