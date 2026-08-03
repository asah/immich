import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Int8,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  Unique,
} from '@immich/sql-tools';
import { StoryRevisionSource } from 'src/enum';
import { story_revision_source_enum } from 'src/schema/enums';
import { StoryTable } from 'src/schema/tables/story.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('story_revision')
@Unique({ columns: ['storyId', 'revision'] })
@Unique({ columns: ['storyId', 'id'] })
export class StoryRevisionTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', index: true })
  storyId!: string;

  @Column({ type: 'bigint' })
  revision!: Int8;

  @Column({ type: 'integer' })
  schemaVersion!: number;

  @Column({ type: 'jsonb' })
  document!: Record<string, unknown>;

  @Column({ type: 'bytea' })
  contentHash!: Buffer;

  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  actorId!: string | null;

  @Column({ enum: story_revision_source_enum })
  source!: StoryRevisionSource;

  @Column({ type: 'character varying', length: 500 })
  summary!: string;

  @Column({ type: 'character varying', length: 100, nullable: true })
  name!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
