import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { CreateIdColumn, UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { AlbumUserRole } from 'src/enum';
import { album_user_role_enum } from 'src/schema/enums';
import { StoryTable } from 'src/schema/tables/story.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('story_user')
@Index({ name: 'story_user_unique_owner', columns: ['storyId'], unique: true, where: `role = 'owner'` })
@UpdatedAtTrigger('story_user_updatedAt')
export class StoryUserTable {
  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  storyId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  userId!: string;

  @Column({ enum: album_user_role_enum, default: AlbumUserRole.Editor })
  role!: Generated<AlbumUserRole>;

  @CreateIdColumn({ index: true })
  createId!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
