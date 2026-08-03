import { STORY_PAGE_SIZES, type StoryAspectRatio, type StoryFrame, type StoryPoint } from './story-model';

export type StoryViewportMetrics = {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
};

export const quantizeStoryUnit = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new TypeError('Story geometry values must be finite');
  }
  return (Math.sign(value) * Math.round(Math.abs(value) * 1000)) / 1000;
};

export const normalizeStoryRotation = (degrees: number) => {
  const normalized = ((((quantizeStoryUnit(degrees) + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
};

export const getStoryViewportMetrics = (
  aspectRatio: StoryAspectRatio,
  containerWidth: number,
  containerHeight: number,
  zoom = 1,
): StoryViewportMetrics => {
  const page = STORY_PAGE_SIZES[aspectRatio];
  const scale = Math.min(containerWidth / page.width, containerHeight / page.height) * Math.max(zoom, 0.01);
  const renderedWidth = page.width * scale;
  const renderedHeight = page.height * scale;
  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
  };
};

export const storyPointToViewport = (point: StoryPoint, metrics: StoryViewportMetrics): StoryPoint => ({
  x: metrics.offsetX + point.x * metrics.scale,
  y: metrics.offsetY + point.y * metrics.scale,
});

export const viewportPointToStory = (point: StoryPoint, metrics: StoryViewportMetrics): StoryPoint => ({
  x: (point.x - metrics.offsetX) / metrics.scale,
  y: (point.y - metrics.offsetY) / metrics.scale,
});

export const storyElementTransform = (frame: StoryFrame, rotation: number) =>
  `translate(${frame.x}px, ${frame.y}px) rotate(${normalizeStoryRotation(rotation)}deg)`;

export const resizeStoryVideoFrame = (
  frame: StoryFrame,
  intrinsicWidth: number,
  intrinsicHeight: number,
  dimension: 'width' | 'height',
  value: number,
): StoryFrame => {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0 || value <= 0) {
    throw new RangeError('Video dimensions must be positive');
  }
  const ratio = intrinsicWidth / intrinsicHeight;
  return dimension === 'width'
    ? { ...frame, width: quantizeStoryUnit(value), height: quantizeStoryUnit(value / ratio) }
    : { ...frame, width: quantizeStoryUnit(value * ratio), height: quantizeStoryUnit(value) };
};

export const moveStoryItem = <T extends { id: string }>(
  items: readonly T[],
  id: string,
  target: { beforeId: string } | { afterId: string },
) => {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new RangeError(`Unknown item: ${id}`);
  }
  const without = items.filter((candidate) => candidate.id !== id);
  const targetId = 'beforeId' in target ? target.beforeId : target.afterId;
  const targetIndex = without.findIndex((candidate) => candidate.id === targetId);
  if (targetIndex < 0) {
    throw new RangeError(`Unknown target: ${targetId}`);
  }
  const insertionIndex = 'beforeId' in target ? targetIndex : targetIndex + 1;
  return [...without.slice(0, insertionIndex), item, ...without.slice(insertionIndex)];
};
