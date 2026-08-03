import { ForeignKeyColumn, Table } from '@immich/sql-tools';
import { AssetTable } from 'src/schema/tables/asset.table';
import { StoryRevisionTable } from 'src/schema/tables/story-revision.table';
import { StoryTable } from 'src/schema/tables/story.table';

@Table('story_published_asset')
export class StoryPublishedAssetTable {
  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  storyId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  assetId!: string;

  @ForeignKeyColumn(() => StoryRevisionTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', index: true })
  revisionId!: string;
}
