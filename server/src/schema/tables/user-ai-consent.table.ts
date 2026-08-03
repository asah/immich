import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { AiProviderTable } from 'src/schema/tables/ai-provider.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('user_ai_consent')
@Check({ name: 'user_ai_consent_disclosureHash_check', expression: `octet_length("providerDisclosureHash") = 32` })
export class UserAiConsentTable {
  @PrimaryColumn()
  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;

  @PrimaryColumn()
  @ForeignKeyColumn(() => AiProviderTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  providerId!: string;

  @Column({ type: 'boolean', default: false })
  textAllowed!: Generated<boolean>;

  @Column({ type: 'boolean', default: false })
  thumbnailAllowed!: Generated<boolean>;

  @Column({ type: 'bytea' })
  providerDisclosureHash!: Buffer;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
