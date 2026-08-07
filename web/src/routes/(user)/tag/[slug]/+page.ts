import { getAllTags } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);
  const name = decodeURIComponent(params.slug);
  const tags = await getAllTags();
  const tag = tags.find(({ value, name: tagName }) => value === name || tagName === name);
  const $t = await getFormatter();
  return { tag, name, meta: { title: tag?.name ?? (name || $t('tags')) } };
}) satisfies PageLoad;
