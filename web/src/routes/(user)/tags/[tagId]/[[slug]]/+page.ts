import { getTagById } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);
  const tag = await getTagById({ id: params.tagId });
  return { tag, meta: { title: tag.name } };
}) satisfies PageLoad;
