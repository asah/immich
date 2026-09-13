import { getAlbumInfo } from '@immich/sdk';
import { redirect } from '@sveltejs/kit';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

export const load = (async ({ params, url, depends }) => {
  await authenticate(url);

  depends('album:data');

  const album = await getAlbumInfo({ id: params.albumId });
  if (album.slug) {
    throw redirect(308, url.pathname.replace(`/albums/${params.albumId}`, `/albums/${album.slug}`) + url.search);
  }

  return {
    album,
    meta: {
      title: album.albumName,
    },
  };
}) satisfies PageLoad;
