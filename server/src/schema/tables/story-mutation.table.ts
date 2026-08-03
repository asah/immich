import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Int8,
  Table,
  Timestamp,
  Unique,
} from '@immich/sql-tools';
import { StoryRevisionTable } from 'src/schema/tables/story-revision.table';
import { StoryTable } from 'src/schema/tables/story.table';

@Table('story_mutation')
@Unique({ columns: ['storyId', 'clientMutationId'] })
@Unique({ columns: ['storyId', 'sessionId', 'clientSequence'] })
@Check({ name: 'story_mutation_clientSequence_check', expression: `"clientSequence" >= 0` })
export class StoryMutationTable {
  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  storyId!: string;

  @Column({ type: 'uuid' })
  clientMutationId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'bigint' })
  clientSequence!: Int8;

  @Column({ type: 'bigint' })
  baseRevision!: Int8;

  @ForeignKeyColumn(() => StoryRevisionTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  resultRevisionId!: string;

  @Column({ type: 'bytea' })
  requestHash!: Buffer;

  @Column({ type: 'jsonb' })
  response!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
