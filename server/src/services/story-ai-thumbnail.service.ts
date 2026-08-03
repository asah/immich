import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AssetFileType, AssetType } from 'src/enum';
import { AssetRepository } from 'src/repositories/asset.repository';
import { StoryAiThumbnail } from 'src/services/story-ai-provider.service';

const MAX_THUMBNAILS = 8;
const MAX_EDGE_PIXELS = 128;
const MAX_THUMBNAIL_BYTES = 16_000;
const MAX_TOTAL_BYTES = 96_000;

/** Reads encoded thumbnails only; original paths returned by the repository are deliberately ignored. */
@Injectable()
export class StoryAiThumbnailService {
  constructor(private assetRepository: AssetRepository) {}

  async get(assetIds: string[]): Promise<StoryAiThumbnail[]> {
    const candidates = [...new Set(assetIds)].slice(0, MAX_THUMBNAILS * 2);
    const assets = await this.assetRepository.getByIds(candidates);
    const images = new Set(
      assets.filter((asset) => asset.type === AssetType.Image && !asset.deletedAt).map(({ id }) => id),
    );
    const thumbnails: StoryAiThumbnail[] = [];
    let totalBytes = 0;
    for (const assetId of candidates) {
      if (!images.has(assetId) || thumbnails.length >= MAX_THUMBNAILS) {
        continue;
      }
      try {
        const { path } = await this.assetRepository.getForThumbnail(assetId, AssetFileType.Thumbnail, false);
        if (!path) {
          continue;
        }
        const bytes = await sharp(path)
          .rotate()
          .resize(MAX_EDGE_PIXELS, MAX_EDGE_PIXELS, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 40, chromaSubsampling: '4:2:0' })
          .toBuffer();
        if (bytes.length > MAX_THUMBNAIL_BYTES || totalBytes + bytes.length > MAX_TOTAL_BYTES) {
          continue;
        }
        totalBytes += bytes.length;
        thumbnails.push({ mimeType: 'image/jpeg', base64: bytes.toString('base64') });
      } catch {
        // Missing or corrupt derived previews are non-fatal; originals are never used as fallback.
      }
    }
    return thumbnails;
  }
}
