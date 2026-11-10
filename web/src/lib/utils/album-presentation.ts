import {
  Version as PresentationVersion,
  SortBy as PublishedSortBy,
  SortOrder as PublishedSortOrder,
  type AlbumPresentationDto,
  type AlbumResponseDto,
} from '@immich/sdk';
import {
  AlbumAssetSortBy,
  SortOrder,
  defaultAlbumAssetDisplayInfo,
  type AlbumAssetSortCriterion,
  type AlbumAssetViewSettings,
} from '$lib/stores/preferences.store';

const defaultSortCriteria: AlbumAssetSortCriterion[] = [
  { sortBy: AlbumAssetSortBy.DateTaken, sortOrder: SortOrder.Desc },
];

export const getAlbumPresentationSettings = (
  presentation: AlbumResponseDto['presentation'],
): AlbumAssetViewSettings => {
  const sortCriteria = presentation?.sortCriteria as AlbumAssetSortCriterion[] | undefined;
  const primary = sortCriteria?.[0] ?? defaultSortCriteria[0];

  return {
    sortBy: primary.sortBy,
    sortOrder: primary.sortOrder,
    sortCriteria: sortCriteria?.length ? sortCriteria : defaultSortCriteria,
    showSortDividers: presentation?.showSortDividers ?? true,
    rowHeight: presentation?.rowHeight,
    instantCameraStyle: presentation?.instantCameraStyle ?? false,
    displayInfo: { ...defaultAlbumAssetDisplayInfo, ...presentation?.displayInfo },
  };
};

export const toAlbumPresentation = (settings: AlbumAssetViewSettings): AlbumPresentationDto => ({
  version: PresentationVersion.$1,
  sortCriteria: (settings.sortCriteria?.length ? settings.sortCriteria : defaultSortCriteria).map((criterion) => ({
    sortBy: criterion.sortBy as unknown as PublishedSortBy,
    sortOrder: criterion.sortOrder as unknown as PublishedSortOrder,
  })),
  showSortDividers: settings.showSortDividers,
  rowHeight: settings.rowHeight,
  instantCameraStyle: settings.instantCameraStyle ?? false,
  displayInfo: { ...defaultAlbumAssetDisplayInfo, ...settings.displayInfo },
});
