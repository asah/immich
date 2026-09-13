import type { AssetResponseDto } from '@immich/sdk';
import { SortOrder } from '$lib/stores/preferences.store';

export const untaggedAlbumSection = 'Untagged';

export const getAlbumTagSection = (asset: AssetResponseDto) => asset.tags?.[0]?.name ?? untaggedAlbumSection;

/**
 * Tags follow the requested direction, while assets with no tag are always a
 * final synthetic section. Using tag presence (rather than the display label)
 * keeps a real tag called “Untagged” behaving like any other tag.
 */
export const compareAlbumTagSections = (left: AssetResponseDto, right: AssetResponseDto, order: SortOrder) => {
  const leftUntagged = !left.tags?.length;
  const rightUntagged = !right.tags?.length;
  if (leftUntagged !== rightUntagged) return leftUntagged ? 1 : -1;

  const leftSection = getAlbumTagSection(left);
  const rightSection = getAlbumTagSection(right);
  if (leftSection === rightSection) return 0;
  const comparison = leftSection < rightSection ? -1 : 1;
  return order === SortOrder.Desc ? -comparison : comparison;
};
