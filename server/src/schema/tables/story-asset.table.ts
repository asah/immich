import { Column, CreateDateColumn, ForeignKeyColumn, Generated, Table, Timestamp } from '@immich/sql-tools';
import { AlbumTable } from 'src/schema/tables/album.table';
import { AssetTable } from 'src/schema/tables/asset.table';
import { StoryTable } from 'src/schema/tables/story.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('story_asset')
export class StoryAssetTable {
  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  storyId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  assetId!: string;

  @Column({ type: 'integer' })
  roleMask!: number;

  @ForeignKeyColumn(() => AlbumTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  sourceAlbumId!: string | null;

  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  addedById!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
