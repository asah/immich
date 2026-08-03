import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ForeignKeyConstraint,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { StoryAspectRatio } from 'src/enum';
import { story_aspect_ratio_enum } from 'src/schema/enums';
import { StoryRevisionTable } from 'src/schema/tables/story-revision.table';

@Table('story')
@ForeignKeyConstraint({
  name: 'story_draftRevision_fkey',
  columns: ['id', 'draftRevisionId'],
  referenceTable: () => StoryRevisionTable,
  referenceColumns: ['storyId', 'id'],
  synchronize: false,
})
@ForeignKeyConstraint({
  name: 'story_publishedRevision_fkey',
  columns: ['id', 'publishedRevisionId'],
  referenceTable: () => StoryRevisionTable,
  referenceColumns: ['storyId', 'id'],
  synchronize: false,
})
@UpdatedAtTrigger('story_updatedAt')
export class StoryTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @Column({ type: 'character varying', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: Generated<string>;

  @Column({ enum: story_aspect_ratio_enum })
  aspectRatio!: StoryAspectRatio;

  // Added as deferred foreign keys by the generated migration because revisions also reference stories.
  @Column({ type: 'uuid' })
  draftRevisionId!: string;

  @Column({ type: 'uuid', nullable: true })
  publishedRevisionId!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @DeleteDateColumn()
  deletedAt!: Timestamp | null;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
