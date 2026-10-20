import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  type Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger } from 'src/decorators.js';
import { AlbumTable } from 'src/schema/tables/album.table.js';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { SharedLinkTable } from 'src/schema/tables/shared-link.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('album_vote')
@UpdatedAtTrigger('album_vote_updatedAt')
@Check({ name: 'album_vote_value_check', expression: '"value" IN (-1, 1)' })
export class AlbumVoteTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  albumId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  assetId!: string;

  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string | null;

  @ForeignKeyColumn(() => SharedLinkTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  sharedLinkId!: string | null;

  @Column({ type: 'bytea', nullable: true })
  anonymousVoterHash!: Buffer | null;

  @Column({ type: 'smallint' })
  value!: number;
}
