import { error } from '@sveltejs/kit';
import { getAllAlbums } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ params, url, depends }) => {
  await authenticate(url);
  depends('album:data');
  const [album] = await getAllAlbums({ slug: params.slug });
  if (!album) {
    throw error(404, 'Album not found');
  }
  return { album, meta: { title: album.albumName } };
}) satisfies PageLoad;
