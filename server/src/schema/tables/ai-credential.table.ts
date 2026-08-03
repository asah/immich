import {
  Check,
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { AiCredentialTestStatus } from 'src/enum';
import { ai_credential_test_status_enum } from 'src/schema/enums';
import { UserTable } from 'src/schema/tables/user.table';

@Table('ai_credential')
@Check({ name: 'ai_credential_ciphertext_check', expression: `octet_length("encryptedBytes") > 0` })
@Check({ name: 'ai_credential_nonce_check', expression: `octet_length("nonce") >= 12` })
@Check({ name: 'ai_credential_authenticationTag_check', expression: `octet_length("authenticationTag") >= 16` })
@Check({ name: 'ai_credential_masterKeyVersion_check', expression: `"masterKeyVersion" > 0` })
@Check({ name: 'ai_credential_fingerprint_check', expression: `length(fingerprint) > 0` })
export class AiCredentialTable {
  @PrimaryGeneratedColumn('uuid')
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string | null;

  @Column({ type: 'bytea' })
  encryptedBytes!: Buffer;

  @Column({ type: 'bytea' })
  nonce!: Buffer;

  @Column({ type: 'bytea' })
  authenticationTag!: Buffer;

  @Column({ type: 'integer' })
  masterKeyVersion!: number;

  @Column({ type: 'character varying', length: 64 })
  fingerprint!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastTestedAt!: Timestamp | null;

  @Column({ enum: ai_credential_test_status_enum, default: AiCredentialTestStatus.Untested })
  lastTestedStatus!: Generated<AiCredentialTestStatus>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
