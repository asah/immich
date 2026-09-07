import { getAlbumInfo } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => ({ album: await getAlbumInfo({ id: params.albumId }) })) satisfies PageLoad;
