import { JustifiedLayout, type LayoutOptions } from '@immich/justified-layout-wasm';
import type { AssetResponseDto } from '@immich/sdk';
import createJustifiedLayout from 'justified-layout';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { getAssetRatio } from '$lib/utils/asset-utils';
import { isTimelineAsset, isTimelineAssets } from '$lib/utils/timeline-util';
import { TUNABLES } from '$lib/utils/tunables';

export type getJustifiedLayoutFromAssetsFunction = typeof getJustifiedLayoutFromAssets;

const useWasm = TUNABLES.LAYOUT.WASM;

export type CommonJustifiedLayout = {
  containerWidth: number;
  containerHeight: number;
  getTop(boxIdx: number): number;
  getLeft(boxIdx: number): number;
  getWidth(boxIdx: number): number;
  getHeight(boxIdx: number): number;
  getPosition(boxIdx: number): { top: number; left: number; width: number; height: number };
};

export type CommonLayoutOptions = {
  rowHeight: number;
  rowWidth: number;
  spacing: number;
  heightTolerance: number;
};

export function getJustifiedLayoutFromAssets(
  assets: TimelineAsset[] | AssetResponseDto[],
  options: CommonLayoutOptions,
): CommonJustifiedLayout {
  if (useWasm) {
    return isTimelineAssets(assets) ? wasmLayoutFromTimeline(assets, options) : wasmLayoutFromDto(assets, options);
  }
  return justifiedLayout(assets, options);
}

function wasmLayoutFromTimeline(assets: TimelineAsset[], options: LayoutOptions) {
  const aspectRatios = new Float32Array(assets.length);
  for (let i = 0; i < assets.length; i++) {
    aspectRatios[i] = assets[i].ratio;
  }
  return new JustifiedLayout(aspectRatios, options);
}

function wasmLayoutFromDto(assets: AssetResponseDto[], options: LayoutOptions) {
  const aspectRatios = new Float32Array(assets.length);
  for (let i = 0; i < assets.length; i++) {
    aspectRatios[i] = getAssetRatio(assets[i]) ?? 1;
  }
  return new JustifiedLayout(aspectRatios, options);
}

type Geometry = ReturnType<typeof createJustifiedLayout>;
class Adapter {
  result;
  width;
  constructor(result: Geometry) {
    this.result = result;
    this.width = 0;
    for (const box of this.result.boxes) {
      if (box.top === 0) {
        this.width = box.left + box.width;
      } else {
        break;
      }
    }
  }

  get containerWidth() {
    return this.width;
  }

  get containerHeight() {
    return this.result.containerHeight;
  }

  getTop(boxIdx: number) {
    return this.result.boxes[boxIdx]?.top;
  }

  getLeft(boxIdx: number) {
    return this.result.boxes[boxIdx]?.left;
  }

  getWidth(boxIdx: number) {
    return this.result.boxes[boxIdx]?.width;
  }

  getHeight(boxIdx: number) {
    return this.result.boxes[boxIdx]?.height;
  }

  getPosition(boxIdx: number) {
    const box = this.result.boxes[boxIdx];
    return { top: box.top, left: box.left, width: box.width, height: box.height };
  }
}

export function justifiedLayout(assets: (TimelineAsset | AssetResponseDto)[], options: CommonLayoutOptions) {
  const adapter = {
    targetRowHeight: options.rowHeight,
    containerWidth: options.rowWidth,
    boxSpacing: options.spacing,
    targetRowHeightTolerange: options.heightTolerance,
    containerPadding: 0,
  };

  const result = createJustifiedLayout(
    assets.map((asset) => (isTimelineAsset(asset) ? asset.ratio : (getAssetRatio(asset) ?? 1))),
    adapter,
  );
  return new Adapter(result);
}

export const emptyGeometry = () =>
  new Adapter({
    containerHeight: 0,
    widowCount: 0,
    boxes: [],
  });

export type CommonPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type GroupedJustifiedLayout = CommonJustifiedLayout & {
  dividerTops: number[];
};

export function getGroupedJustifiedLayoutFromAssets(
  assets: AssetResponseDto[],
  groupKeys: string[],
  options: CommonLayoutOptions,
  dividerHeight = 32,
  headerHeight = 0,
): GroupedJustifiedLayout {
  if (assets.length === 0) {
    return {
      containerWidth: 0,
      containerHeight: 0,
      dividerTops: [],
      getTop: () => 0,
      getLeft: () => 0,
      getWidth: () => 0,
      getHeight: () => 0,
      getPosition: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    };
  }

  const positions: CommonPosition[] = [];
  const dividerTops: number[] = [];
  let groupStart = 0;
  let topOffset = 0;

  for (let index = 1; index <= assets.length; index++) {
    if (index < assets.length && groupKeys[index] === groupKeys[groupStart]) {
      continue;
    }

    if (headerHeight > 0) {
      dividerTops.push(topOffset + headerHeight / 2);
      topOffset += headerHeight;
    } else if (groupStart > 0) {
      dividerTops.push(topOffset + dividerHeight / 2);
      topOffset += dividerHeight;
    }

    const groupLayout = getJustifiedLayoutFromAssets(assets.slice(groupStart, index), options);
    for (let groupIndex = 0; groupIndex < index - groupStart; groupIndex++) {
      const position = groupLayout.getPosition(groupIndex);
      positions.push({ ...position, top: position.top + topOffset });
    }
    topOffset += groupLayout.containerHeight;
    groupStart = index;
  }

  return {
    containerWidth: options.rowWidth,
    containerHeight: topOffset,
    dividerTops,
    getTop: (index) => positions[index]?.top,
    getLeft: (index) => positions[index]?.left,
    getWidth: (index) => positions[index]?.width,
    getHeight: (index) => positions[index]?.height,
    getPosition: (index) => positions[index],
  };
}
