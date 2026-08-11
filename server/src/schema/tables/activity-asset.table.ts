import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
} from '@immich/sql-tools';
import { ActivityTable } from 'src/schema/tables/activity.table';
import { AssetTable } from 'src/schema/tables/asset.table';

@Table('activity_asset')
@Index({ name: 'activity_asset_activityId_idx', columns: ['activityId'] })
@Index({ name: 'activity_asset_assetId_idx', columns: ['assetId'] })
@Index({ name: 'activity_asset_unique', columns: ['activityId', 'assetId'], unique: true })
export class ActivityAssetTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => ActivityTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  activityId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  assetId!: string;

  @Column({ type: 'integer', default: 0 })
  position!: Generated<number>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
