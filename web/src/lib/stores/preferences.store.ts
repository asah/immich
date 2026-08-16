import { persisted } from 'svelte-persisted-store';
import { browser } from '$app/environment';
import { defaultLang } from '$lib/constants';
import { convertBCP47, getPreferredLocale } from '$lib/utils/i18n';

// Locale to use for formatting dates, numbers, etc.
export const locale = persisted('locale', 'default', {
  serializer: {
    parse: (text) => convertBCP47(text) || 'default',
    stringify: (object) => object ?? '',
  },
});

const preferredLocale = browser ? getPreferredLocale() : undefined;
export const lang = persisted<string>('lang', preferredLocale || defaultLang.code, {
  serializer: {
    parse: (text) => convertBCP47(text),
    stringify: (object) => object ?? '',
  },
});

export interface MapSettings {
  allowDarkMode: boolean;
  includeArchived: boolean;
  onlyFavorites: boolean;
  withPartners: boolean;
  withSharedAlbums: boolean;
  relativeDate: string;
  dateAfter?: string;
  dateBefore?: string;
}

const defaultMapSettings = {
  allowDarkMode: true,
  includeArchived: false,
  onlyFavorites: false,
  withPartners: false,
  withSharedAlbums: false,
  relativeDate: '',
};

const persistedObject = <T>(key: string, defaults: T) =>
  persisted<T>(key, defaults, {
    serializer: {
      parse: (text) => ({ ...defaults, ...JSON.parse(text ?? null) }),
      stringify: JSON.stringify,
    },
  });

export const mapSettings = persistedObject<MapSettings>('map-settings', defaultMapSettings);

export interface AlbumViewSettings {
  view: string;
  filter: string;
  groupBy: string;
  groupOrder: string;
  sortBy: string;
  sortOrder: string;
  collapsedGroups: {
    // Grouping Option => Array<Group ID>
    [group: string]: string[];
  };
}

export interface PlacesViewSettings {
  groupBy: string;
  collapsedGroups: {
    // Grouping Option => Array<Group ID>
    [group: string]: string[];
  };
}

export interface SidebarSettings {
  people: boolean;
  sharing: boolean;
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export enum AlbumViewMode {
  Cover = 'Cover',
  List = 'List',
}

export enum AlbumAssetSortBy {
  DateTaken = 'dateTaken',
  FileName = 'fileName',
  FileSize = 'fileSize',
  Tag = 'tag',
}

export interface AlbumAssetViewSettings {
  sortBy: AlbumAssetSortBy;
  sortOrder: SortOrder;
  sortCriteria?: AlbumAssetSortCriterion[];
  showSortDividers: boolean;
  imageBorder: AlbumAssetImageBorder;
  displayInfo: AlbumAssetDisplayInfo;
}

export enum AlbumAssetImageBorder {
  None = 'none',
  Thin = 'thin',
  Thick = 'thick',
}

export interface AlbumAssetSortCriterion {
  sortBy: AlbumAssetSortBy;
  sortOrder: SortOrder;
}

export interface AlbumAssetDisplayInfo {
  location: boolean;
  date: boolean;
  time: boolean;
  filename: boolean;
  description: boolean;
  fileSize: boolean;
  camera: boolean;
  cameraSettings: boolean;
  lens: boolean;
  lensSettings: boolean;
}

export const defaultAlbumAssetDisplayInfo: AlbumAssetDisplayInfo = {
  location: false,
  date: false,
  time: false,
  filename: false,
  description: false,
  fileSize: false,
  camera: false,
  cameraSettings: false,
  lens: false,
  lensSettings: false,
};

export const albumAssetViewSettings = persistedObject<AlbumAssetViewSettings>('album-asset-view-settings', {
  sortBy: AlbumAssetSortBy.DateTaken,
  sortOrder: SortOrder.Desc,
  sortCriteria: [{ sortBy: AlbumAssetSortBy.DateTaken, sortOrder: SortOrder.Desc }],
  showSortDividers: true,
  imageBorder: AlbumAssetImageBorder.Thick,
  displayInfo: defaultAlbumAssetDisplayInfo,
});

export enum AlbumFilter {
  All = 'All',
  Owned = 'Owned',
  Shared = 'Shared',
}

export enum AlbumGroupBy {
  None = 'None',
  Year = 'Year',
  Owner = 'Owner',
}

export enum AlbumSortBy {
  Title = 'Title',
  ItemCount = 'ItemCount',
  DateModified = 'DateModified',
  DateCreated = 'DateCreated',
  MostRecentPhoto = 'MostRecentPhoto',
  OldestPhoto = 'OldestPhoto',
}

export const albumViewSettings = persisted<AlbumViewSettings>('album-view-settings', {
  view: AlbumViewMode.Cover,
  filter: AlbumFilter.All,
  groupBy: AlbumGroupBy.Year,
  groupOrder: SortOrder.Desc,
  sortBy: AlbumSortBy.MostRecentPhoto,
  sortOrder: SortOrder.Desc,
  collapsedGroups: {},
});

export enum PlacesGroupBy {
  None = 'None',
  Country = 'Country',
}

export const placesViewSettings = persisted<PlacesViewSettings>('places-view-settings', {
  groupBy: PlacesGroupBy.None,
  collapsedGroups: {},
});

export const showDeleteModal = persisted<boolean>('delete-confirm-dialog', true, {});

export const alwaysLoadOriginalFile = persisted<boolean>('always-load-original-file', false, {});

export const playVideoThumbnailOnHover = persisted<boolean>('play-video-thumbnail-on-hover', true, {});

export const loopVideo = persisted<boolean>('loop-video', true, {});

export const autoPlayVideo = persisted<boolean>('auto-play-video', true, {});

export const alwaysLoadOriginalVideo = persisted<boolean>('always-load-original-video', false, {});

export const recentAlbumsDropdown = persisted<boolean>('recent-albums-open', true, {});
