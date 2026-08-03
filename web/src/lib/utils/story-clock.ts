import type { StoryAnimation, StoryScene } from './story-model';

export type StoryMotionPolicy = 'full' | 'reduced' | 'disabled';

export const clampStoryTime = (scene: StoryScene, timeMs: number) =>
  Math.min(scene.durationMs, Math.max(0, Number.isFinite(timeMs) ? timeMs : 0));

export const isStoryVideoTriggered = (
  mode: 'click' | 'autoplay' | 'delay',
  delayMs: number | undefined,
  timeMs: number,
) => mode === 'autoplay' || (mode === 'delay' && timeMs >= (delayMs ?? 0));

export type StoryAnimationState = { opacity: number; transform: string };

export const getStoryAnimationState = (
  animation: StoryAnimation | undefined,
  timeMs: number,
  motion: StoryMotionPolicy,
): StoryAnimationState => {
  if (!animation) {
    return { opacity: 1, transform: 'none' };
  }
  const reduced = motion !== 'full';
  if (reduced && animation.reducedMotion === 'omit') {
    return { opacity: 1, transform: 'none' };
  }
  if (reduced && animation.reducedMotion === 'instant') {
    return { opacity: timeMs >= animation.startMs ? 1 : 0, transform: 'none' };
  }
  const duration = reduced ? 100 : Math.max(animation.durationMs, 1);
  const progress = Math.min(1, Math.max(0, (timeMs - animation.startMs) / duration));
  if (reduced || animation.preset === 'fade') {
    return { opacity: progress, transform: 'none' };
  }
  const remaining = 1 - progress;
  const distance = 32 * remaining;
  switch (animation.preset) {
    case 'rise': {
      return { opacity: progress, transform: `translateY(${distance}px)` };
    }
    case 'slide': {
      return { opacity: progress, transform: `translateX(${distance}px)` };
    }
    case 'scale': {
      return { opacity: progress, transform: `scale(${0.9 + progress * 0.1})` };
    }
    case 'pan_zoom': {
      return { opacity: 1, transform: `scale(${1 + progress * 0.05}) translateX(${progress * 8}px)` };
    }
    default: {
      return { opacity: progress, transform: 'none' };
    }
  }
};
