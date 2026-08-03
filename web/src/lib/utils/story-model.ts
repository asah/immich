export const STORY_PAGE_SIZES = {
  'portrait-4:5': { width: 800, height: 1000 },
  'landscape-16:9': { width: 1600, height: 900 },
  'square-1:1': { width: 1000, height: 1000 },
} as const;

export type StoryAspectRatio = keyof typeof STORY_PAGE_SIZES;
export type StoryPoint = { x: number; y: number };
export type StoryFrame = StoryPoint & { width: number; height: number };
export type StoryElementType = 'image' | 'video' | 'text' | 'sticker' | 'shape';

export type StoryBorder = {
  width: number;
  style: 'solid' | 'dashed' | 'double';
  color: string;
  opacity: number;
};

export type StoryAnimation = {
  preset: 'fade' | 'rise' | 'slide' | 'scale' | 'pan_zoom';
  startMs: number;
  durationMs: number;
  easing: 'linear' | 'ease' | 'ease_in' | 'ease_out' | 'ease_in_out';
  reducedMotion: 'omit' | 'fade' | 'instant';
};

/** Exact web representation of server StoryElementSchema. */
export type StoryElement = {
  id: string;
  type: StoryElementType;
  frame: StoryFrame;
  rotation: number;
  assetId?: string;
  text?: string;
  style: Record<string, unknown>;
  border?: StoryBorder | null;
  animation?: StoryAnimation | null;
  videoPlayback?: { mode: 'click' | 'autoplay' | 'delayed'; delayMs: number };
  ariaHidden: boolean;
  altText?: string;
};

/** Exact web representation of server StorySceneSchema. */
export type StoryScene = {
  id: string;
  template: string;
  background: string;
  durationMs: number;
  elements: StoryElement[];
  readingOrder: string[];
};

/** Exact web representation of server StoryDocumentSchema. */
export type StoryDocument = {
  schemaVersion: 1;
  theme: { id: string; version: number };
  cover: StoryScene;
  pages: StoryScene[];
  unplacedAssetIds: string[];
  curation: Record<string, 'include' | 'must_include' | 'maybe' | 'exclude'>;
};

export type StoryMediaSource = { imageUrl?: string; posterUrl?: string; videoUrl?: string; alt?: string };
export type StoryMediaResolver = (assetId: string, kind: 'image' | 'sticker' | 'video') => StoryMediaSource;
export type StoryStickerResolver = (token: string) => string | undefined;

export const storyStyleString = (element: StoryElement, key: string, fallback: string) =>
  typeof element.style[key] === 'string' ? (element.style[key] as string) : fallback;
export const storyStyleNumber = (element: StoryElement, key: string, fallback: number) =>
  typeof element.style[key] === 'number' && Number.isFinite(element.style[key])
    ? (element.style[key] as number)
    : fallback;
export const storyStylePoint = (element: StoryElement, key: string, fallback: StoryPoint): StoryPoint => {
  const value = element.style[key];
  return value &&
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
    ? { x: Math.min(1, Math.max(0, value.x)), y: Math.min(1, Math.max(0, value.y)) }
    : fallback;
};

export const getStoryElementName = (element: StoryElement) => storyStyleString(element, 'name', element.type);
export const getStoryElementLabel = (element: StoryElement) => element.altText || getStoryElementName(element);
export const isDecorativeStoryElement = (element: StoryElement) => element.ariaHidden;

const assertScene = (scene: StoryScene) => {
  if (!scene.id || !scene.template || scene.durationMs < 1000 || scene.durationMs > 60_000)
    throw new TypeError('Invalid story scene');
  const ids = new Set<string>();
  for (const element of scene.elements) {
    if (ids.has(element.id)) throw new TypeError(`Duplicate story element: ${element.id}`);
    ids.add(element.id);
    const { x, y, width, height } = element.frame;
    if (![x, y, width, height, element.rotation].every(Number.isFinite) || width <= 0 || height <= 0)
      throw new TypeError(`Invalid geometry: ${element.id}`);
  }
  const reading = new Set(scene.readingOrder);
  if (reading.size !== scene.readingOrder.length || scene.readingOrder.some((id) => !ids.has(id)))
    throw new TypeError('Invalid reading order');
  if (scene.elements.some((element) => !element.ariaHidden && !reading.has(element.id)))
    throw new TypeError('Meaningful element is absent from reading order');
};

export const assertStoryDocument = (value: unknown): asserts value is StoryDocument => {
  if (!value || typeof value !== 'object') throw new TypeError('Story document must be an object');
  const document = value as Partial<StoryDocument>;
  if (
    document.schemaVersion !== 1 ||
    !document.theme ||
    !document.cover ||
    !Array.isArray(document.pages) ||
    !Array.isArray(document.unplacedAssetIds) ||
    !document.curation
  )
    throw new TypeError('Invalid story document root');
  const ids = new Set<string>();
  for (const scene of [document.cover, ...document.pages]) {
    if (ids.has(scene.id)) throw new TypeError(`Duplicate story scene: ${scene.id}`);
    ids.add(scene.id);
    assertScene(scene);
  }
};
