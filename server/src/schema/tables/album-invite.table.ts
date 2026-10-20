import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  type Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  type Timestamp,
} from '@immich/sql-tools';
import { AlbumUserRole } from 'src/enum.js';
import { album_user_role_enum } from 'src/schema/enums.js';
import { AlbumTable } from 'src/schema/tables/album.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

/** An email-bound, one-time invitation. Tokens are stored only as SHA-256 hashes. */
@Table('album_invite')
@Index({ columns: ['tokenHash'], unique: true })
@Index({ columns: ['albumId', 'email'], unique: true, where: '"acceptedAt" IS NULL AND "revokedAt" IS NULL' })
export class AlbumInviteTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', nullable: false })
  albumId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', nullable: false })
  inviterId!: string;

  @Column()
  email!: string;

  @Column({ type: 'bytea' })
  tokenHash!: Buffer;

  @Column({ enum: album_user_role_enum, default: AlbumUserRole.Viewer })
  role!: Generated<AlbumUserRole>;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Timestamp;

  @Column({ type: 'timestamp with time zone', nullable: true })
  acceptedAt!: Timestamp | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt!: Timestamp | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
