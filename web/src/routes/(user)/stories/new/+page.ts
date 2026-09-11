import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  return { albumId: url.searchParams.get('albumId'), meta: { title: 'Create story' } };
}) satisfies PageLoad;
