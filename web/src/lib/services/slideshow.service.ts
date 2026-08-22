import { SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
import { navigate } from '$lib/utils/navigation';

type SlideshowLauncher = {
  navigateToAsset: (id: string) => Promise<void>;
  start: () => void;
};

const defaultLauncher: SlideshowLauncher = {
  navigateToAsset: (id) => navigate({ targetRoute: 'current', assetId: id }),
  start: () => slideshowStore.slideshowState.set(SlideshowState.PlaySlideshow),
};

/**
 * Opens the asset viewer route and starts its slideshow after the route loader has
 * supplied the full asset to the portal-backed viewer. Timeline records are compact
 * and must not be used as an asset-viewer payload.
 */
export const openSlideshowAtAsset = async (assetId: string, launcher = defaultLauncher) => {
  await launcher.navigateToAsset(assetId);
  launcher.start();
};
