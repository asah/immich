import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Int8,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
} from '@immich/sql-tools';
import { StoryRevisionTable } from 'src/schema/tables/story-revision.table';
import { StoryTable } from 'src/schema/tables/story.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('story_ai_draft')
@Check({ name: 'story_ai_draft_baseRevision_check', expression: `"baseRevision" >= 0` })
@Check({ name: 'story_ai_draft_commandSchemaVersion_check', expression: `"commandSchemaVersion" > 0` })
@Check({ name: 'story_ai_draft_commandHash_check', expression: `octet_length("commandHash") = 32` })
@Check({ name: 'story_ai_draft_expiry_check', expression: `"expiresAt" > "createdAt"` })
@Check({ name: 'story_ai_draft_commands_check', expression: `jsonb_typeof(commands) = 'array'` })
@Check({ name: 'story_ai_draft_diff_check', expression: `jsonb_typeof(diff) = 'object'` })
export class StoryAiDraftTable {
  @PrimaryGeneratedColumn('uuid')
  id!: Generated<string>;

  @ForeignKeyColumn(() => StoryTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  storyId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  actorId!: string;

  @Column({ type: 'bigint' })
  baseRevision!: Int8;

  @Column({ type: 'integer' })
  commandSchemaVersion!: number;

  @Column({ type: 'jsonb' })
  commands!: Record<string, unknown>[];

  @Column({ type: 'bytea' })
  commandHash!: Buffer;

  @Column({ type: 'jsonb' })
  diff!: Record<string, unknown>;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Timestamp;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @ForeignKeyColumn(() => StoryRevisionTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  appliedRevisionId!: string | null;
}
