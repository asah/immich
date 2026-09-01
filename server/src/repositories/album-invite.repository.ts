import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { AlbumInviteTable } from 'src/schema/tables/album-invite.table';

@Injectable()
export class AlbumInviteRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async createOrReplace(dto: Insertable<AlbumInviteTable>) {
    return this.db.transaction().execute(async (trx) => {
      const active = await trx
        .selectFrom('album_invite')
        .select('id')
        .where('albumId', '=', dto.albumId!)
        .where('email', '=', dto.email!)
        .where('acceptedAt', 'is', null)
        .where('revokedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      if (active) {
        return trx
          .updateTable('album_invite')
          .set({ tokenHash: dto.tokenHash!, expiresAt: dto.expiresAt! })
          .where('id', '=', active.id)
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      return trx.insertInto('album_invite').values(dto).returningAll().executeTakeFirstOrThrow();
    });
  }

  getByTokenHash(tokenHash: Buffer) {
    return this.db.selectFrom('album_invite').selectAll().where('tokenHash', '=', tokenHash).executeTakeFirst();
  }

  async redeem(
    tokenHash: Buffer,
    dto: { name: string; password: string; quotaSizeInBytes: number | null },
  ): Promise<{ status: 'invalid' | 'existing' } | { status: 'success'; userId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const invite = await trx
        .selectFrom('album_invite')
        .selectAll()
        .where('tokenHash', '=', tokenHash)
        .forUpdate()
        .executeTakeFirst();
      if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
        return { status: 'invalid' };
      }

      const existing = await trx
        .selectFrom('user')
        .select('id')
        .where('email', '=', invite.email)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (existing) return { status: 'existing' };

      const user = await trx
        .insertInto('user')
        .values({
          email: invite.email,
          name: dto.name,
          password: dto.password,
          quotaSizeInBytes: dto.quotaSizeInBytes,
          shouldChangePassword: false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx.insertInto('album_user').values({ albumId: invite.albumId, userId: user.id, role: invite.role as AlbumUserRole }).execute();
      await trx.updateTable('album_invite').set({ acceptedAt: new Date() }).where('id', '=', invite.id).execute();

      return { status: 'success', userId: user.id };
    });
  }
}
