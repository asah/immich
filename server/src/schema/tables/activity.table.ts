import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  ForeignKeyConstraint,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { AlbumAssetTable } from 'src/schema/tables/album-asset.table';
import { AlbumTable } from 'src/schema/tables/album.table';
import { AssetTable } from 'src/schema/tables/asset.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('activity')
@UpdatedAtTrigger('activity_updatedAt')
@ForeignKeyConstraint({
  columns: ['albumId', 'assetId'],
  referenceTable: () => AlbumAssetTable,
  referenceColumns: ['albumId', 'assetId'],
  onUpdate: 'NO ACTION',
  onDelete: 'CASCADE',
})
export class ActivityTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  albumId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  assetId!: string | null;

  @Column({ type: 'text', default: null })
  comment!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  commentDocument!: unknown | null;

  @Column({ type: 'character varying', nullable: true })
  reactionKey!: string | null;

  @Column({ type: 'uuid', nullable: true, index: true })
  parentActivityId!: string | null;

  @Column({ type: 'boolean', default: false })
  isLiked!: Generated<boolean>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
