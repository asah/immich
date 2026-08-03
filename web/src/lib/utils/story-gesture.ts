import { normalizeStoryRotation, quantizeStoryUnit } from './story-geometry';
import type { StoryFrame, StoryPoint } from './story-model';

export type StoryGestureMode = 'idle' | 'pending' | 'move' | 'resize' | 'rotate' | 'pan' | 'pinch';
export type StoryGestureResult =
  | { type: 'preview'; frame: StoryFrame; rotation: number }
  | { type: 'commit'; frame: StoryFrame; rotation: number }
  | { type: 'cancel' }
  | { type: 'viewport'; panX: number; panY: number; zoomFactor: number };

type Pointer = StoryPoint & { pointerType: string };

export class StoryGestureController {
  #mode: StoryGestureMode = 'idle';
  #operation: 'move' | 'resize' | 'rotate' = 'move';
  #pointers = new Map<number, Pointer>();
  #start?: Pointer;
  #initialFrame?: StoryFrame;
  #frame?: StoryFrame;
  #initialRotation = 0;
  #rotation = 0;
  #pinchDistance = 0;
  #pinchCenter?: StoryPoint;

  get mode() {
    return this.#mode;
  }

  beginElement(
    pointerId: number,
    pointer: Pointer,
    frame: StoryFrame,
    rotation: number,
    operation: 'move' | 'resize' | 'rotate' = 'move',
  ) {
    if (this.#mode !== 'idle') {
      throw new Error('A story gesture is already active');
    }
    this.#pointers.set(pointerId, pointer);
    this.#start = pointer;
    this.#initialFrame = structuredClone(frame);
    this.#frame = structuredClone(frame);
    this.#initialRotation = rotation;
    this.#rotation = rotation;
    this.#operation = operation;
    this.#mode = 'pending';
  }

  beginPan(pointerId: number, pointer: Pointer) {
    if (this.#mode !== 'idle') return;
    this.#pointers.set(pointerId, pointer);
    this.#start = pointer;
    this.#mode = 'pan';
  }

  addPointer(pointerId: number, pointer: Pointer): StoryGestureResult | undefined {
    this.#pointers.set(pointerId, pointer);
    if (this.#pointers.size !== 2) return;
    const cancelledElement = ['pending', 'move', 'resize', 'rotate'].includes(this.#mode);
    const [first, second] = [...this.#pointers.values()];
    this.#pinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
    this.#pinchCenter = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    this.#mode = 'pinch';
    return cancelledElement ? { type: 'cancel' } : undefined;
  }

  move(
    pointerId: number,
    point: StoryPoint,
    options: { scale: number; snap?: boolean } = { scale: 1 },
  ): StoryGestureResult | undefined {
    const pointer = this.#pointers.get(pointerId);
    if (!pointer || !this.#start) return;
    this.#pointers.set(pointerId, { ...pointer, ...point });
    if (this.#mode === 'pinch' && this.#pointers.size === 2 && this.#pinchCenter) {
      const [first, second] = [...this.#pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      return {
        type: 'viewport',
        panX: center.x - this.#pinchCenter.x,
        panY: center.y - this.#pinchCenter.y,
        zoomFactor: this.#pinchDistance > 0 ? distance / this.#pinchDistance : 1,
      };
    }
    if (this.#mode === 'pan') {
      return { type: 'viewport', panX: point.x - this.#start.x, panY: point.y - this.#start.y, zoomFactor: 1 };
    }
    if (!this.#initialFrame || !this.#frame) return;
    const threshold = pointer.pointerType === 'touch' ? 8 : 4;
    const cssDx = point.x - this.#start.x;
    const cssDy = point.y - this.#start.y;
    if (this.#mode === 'pending' && Math.hypot(cssDx, cssDy) < threshold) return;
    this.#mode = this.#operation;
    const dx = cssDx / options.scale;
    const dy = cssDy / options.scale;
    if (this.#mode === 'move') {
      this.#frame = {
        ...this.#initialFrame,
        x: this.#snap(this.#initialFrame.x + dx, options.snap),
        y: this.#snap(this.#initialFrame.y + dy, options.snap),
      };
    } else if (this.#mode === 'resize') {
      this.#frame = {
        ...this.#initialFrame,
        width: Math.max(1, this.#snap(this.#initialFrame.width + dx, options.snap)),
        height: Math.max(1, this.#snap(this.#initialFrame.height + dy, options.snap)),
      };
    } else {
      const center = {
        x: this.#initialFrame.x + this.#initialFrame.width / 2,
        y: this.#initialFrame.y + this.#initialFrame.height / 2,
      };
      const startAngle = Math.atan2(this.#start.y - center.y * options.scale, this.#start.x - center.x * options.scale);
      const angle = Math.atan2(point.y - center.y * options.scale, point.x - center.x * options.scale);
      this.#rotation = normalizeStoryRotation(this.#initialRotation + ((angle - startAngle) * 180) / Math.PI);
    }
    return { type: 'preview', frame: structuredClone(this.#frame), rotation: this.#rotation };
  }

  end(pointerId: number): StoryGestureResult | undefined {
    this.#pointers.delete(pointerId);
    if (this.#mode === 'pinch') {
      if (this.#pointers.size < 2) this.#reset();
      return;
    }
    if (['move', 'resize', 'rotate'].includes(this.#mode) && this.#frame) {
      const result: StoryGestureResult = {
        type: 'commit',
        frame: structuredClone(this.#frame),
        rotation: this.#rotation,
      };
      this.#reset();
      return result;
    }
    this.#reset();
    return;
  }

  cancel(): StoryGestureResult | undefined {
    if (this.#mode === 'idle') return;
    this.#reset();
    return { type: 'cancel' };
  }

  #snap(value: number, enabled = true) {
    if (!enabled) return quantizeStoryUnit(value);
    const nearest = Math.round(value / 10) * 10;
    return quantizeStoryUnit(Math.abs(nearest - value) <= 3 ? nearest : value);
  }

  #reset() {
    this.#mode = 'idle';
    this.#pointers.clear();
    this.#start = undefined;
    this.#initialFrame = undefined;
    this.#frame = undefined;
    this.#pinchCenter = undefined;
  }
}
