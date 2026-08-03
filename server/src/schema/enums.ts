import { registerEnum } from '@immich/sql-tools';
import {
  AiCredentialTestStatus,
  AiProviderAdapter,
  AlbumUserRole,
  AssetStatus,
  AssetVisibility,
  ChecksumAlgorithm,
  SourceType,
  StoryAspectRatio,
  StoryRevisionSource,
  VideoCodec,
} from 'src/enum';

export const ai_provider_adapter_enum = registerEnum({
  name: 'ai_provider_adapter_enum',
  values: Object.values(AiProviderAdapter),
});

export const ai_credential_test_status_enum = registerEnum({
  name: 'ai_credential_test_status_enum',
  values: Object.values(AiCredentialTestStatus),
});

export const album_user_role_enum = registerEnum({
  name: 'album_user_role_enum',
  values: [AlbumUserRole.Owner, AlbumUserRole.Editor, AlbumUserRole.Viewer],
});

export const story_aspect_ratio_enum = registerEnum({
  name: 'story_aspect_ratio_enum',
  values: Object.values(StoryAspectRatio),
});

export const story_revision_source_enum = registerEnum({
  name: 'story_revision_source_enum',
  values: Object.values(StoryRevisionSource),
});

export const assets_status_enum = registerEnum({
  name: 'assets_status_enum',
  values: Object.values(AssetStatus),
});

export const asset_face_source_type = registerEnum({
  name: 'sourcetype',
  values: Object.values(SourceType),
});

export const asset_visibility_enum = registerEnum({
  name: 'asset_visibility_enum',
  values: Object.values(AssetVisibility),
});

export const asset_checksum_algorithm_enum = registerEnum({
  name: 'asset_checksum_algorithm_enum',
  values: Object.values(ChecksumAlgorithm),
});

export const video_stream_variant_codec_enum = registerEnum({
  name: 'video_stream_variant_codec_enum',
  values: [VideoCodec.Av1, VideoCodec.Hevc, VideoCodec.H264],
});
