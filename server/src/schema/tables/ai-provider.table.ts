import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { AiProviderAdapter } from 'src/enum';
import { ai_provider_adapter_enum } from 'src/schema/enums';
import { AiCredentialTable } from 'src/schema/tables/ai-credential.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('ai_provider')
@Index({
  name: 'ai_provider_enabled_server_uq',
  columns: ['enabled'],
  unique: true,
  where: `"userId" IS NULL AND enabled`,
})
@Index({
  name: 'ai_provider_enabled_user_uq',
  columns: ['userId'],
  unique: true,
  where: `"userId" IS NOT NULL AND enabled`,
})
@Check({ name: 'ai_provider_approvedEndpointId_check', expression: `length("approvedEndpointId") > 0` })
@Check({ name: 'ai_provider_model_check', expression: `length(model) > 0` })
@Check({ name: 'ai_provider_capabilityFlags_check', expression: `"capabilityFlags" >= 0` })
export class AiProviderTable {
  @PrimaryGeneratedColumn('uuid')
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string | null;

  @Column({ enum: ai_provider_adapter_enum })
  adapter!: AiProviderAdapter;

  @Column({ type: 'character varying', length: 100 })
  approvedEndpointId!: string;

  @Column({ type: 'character varying', length: 200 })
  model!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: Generated<boolean>;

  @Column({ type: 'integer', default: 0 })
  capabilityFlags!: Generated<number>;

  @ForeignKeyColumn(() => AiCredentialTable, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  credentialId!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
