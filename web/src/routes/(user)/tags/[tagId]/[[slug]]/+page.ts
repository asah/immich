import { getTagById } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);
  const tag = await getTagById({ id: params.tagId });
  const $t = await getFormatter();
  return { tag, meta: { title: tag.name } };
}) satisfies PageLoad;
