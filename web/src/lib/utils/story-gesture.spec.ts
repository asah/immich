import { describe, expect, it } from 'vitest';
import { StoryGestureController } from './story-gesture';

const frame = { x: 100, y: 100, width: 200, height: 100 };

describe('StoryGestureController', () => {
  it('emits previews during movement and exactly one commit on pointer up', () => {
    const gesture = new StoryGestureController();
    gesture.beginElement(1, { x: 100, y: 100, pointerType: 'mouse' }, frame, 0);
    expect(gesture.move(1, { x: 102, y: 101 }, { scale: 1 })).toBeUndefined();
    expect(gesture.move(1, { x: 120, y: 130 }, { scale: 1, snap: false })).toMatchObject({
      type: 'preview',
      frame: { x: 120, y: 130 },
    });
    expect(gesture.move(1, { x: 140, y: 150 }, { scale: 1, snap: false })).toMatchObject({
      type: 'preview',
      frame: { x: 140, y: 150 },
    });
    expect(gesture.end(1)).toMatchObject({ type: 'commit', frame: { x: 140, y: 150 } });
    expect(gesture.end(1)).toBeUndefined();
  });

  it('cancels an element transform when a second pointer starts a pinch', () => {
    const gesture = new StoryGestureController();
    gesture.beginElement(1, { x: 100, y: 100, pointerType: 'touch' }, frame, 0);
    gesture.move(1, { x: 120, y: 120 }, { scale: 1 });
    expect(gesture.addPointer(2, { x: 200, y: 200, pointerType: 'touch' })).toEqual({ type: 'cancel' });
    expect(gesture.mode).toBe('pinch');
    expect(gesture.move(2, { x: 240, y: 240 }, { scale: 1 })).toMatchObject({ type: 'viewport' });
    expect(gesture.end(2)).toBeUndefined();
    expect(gesture.mode).toBe('idle');
  });

  it('cancels without committing', () => {
    const gesture = new StoryGestureController();
    gesture.beginElement(1, { x: 100, y: 100, pointerType: 'pen' }, frame, 0, 'resize');
    gesture.move(1, { x: 150, y: 150 }, { scale: 1 });
    expect(gesture.cancel()).toEqual({ type: 'cancel' });
    expect(gesture.end(1)).toBeUndefined();
  });
});
