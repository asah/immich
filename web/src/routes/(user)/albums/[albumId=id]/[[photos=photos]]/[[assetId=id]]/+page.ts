import { getAlbumInfoQuery } from '#lib/queries/album.query.ts';
import { queryClient } from '#lib/queries/client.ts';
import { redirect } from '@sveltejs/kit';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ params, url, depends }) => {
  await authenticate(url);

  depends('album:data');

  const album = await queryClient.query({ ...getAlbumInfoQuery(params.albumId), staleTime: 0 });
  if (album.slug) {
    throw redirect(308, url.pathname.replace(`/albums/${params.albumId}`, () => `/albums/${album.slug}`) + url.search);
  }

  return {
    meta: {
      title: album.albumName,
    },
  };
}) satisfies PageLoad;
