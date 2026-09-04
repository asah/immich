import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AlbumUserRole } from 'src/enum';
import { DB } from 'src/schema';
import { AlbumInviteTable } from 'src/schema/tables/album-invite.table';

@Injectable()
export class AlbumInviteRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async createOrReplace(dto: Insertable<AlbumInviteTable>) {
    return this.db
      .insertInto('album_invite')
      .values(dto)
      .onConflict((oc) =>
        oc
          .columns(['albumId', 'email'])
          .where('acceptedAt', 'is', null)
          .where('revokedAt', 'is', null)
          .doUpdateSet({ tokenHash: dto.tokenHash!, expiresAt: dto.expiresAt! }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  getByTokenHash(tokenHash: Buffer) {
    return this.db.selectFrom('album_invite').selectAll().where('tokenHash', '=', tokenHash).executeTakeFirst();
  }

  getPreview(tokenHash: Buffer) {
    return this.db
      .selectFrom('album_invite')
      .innerJoin('album', 'album.id', 'album_invite.albumId')
      .innerJoin('user as inviter', 'inviter.id', 'album_invite.inviterId')
      .select(['album.id as albumId', 'album.albumName', 'inviter.name as senderName', 'album_invite.email'])
      .where('album_invite.tokenHash', '=', tokenHash)
      .where('album_invite.acceptedAt', 'is', null)
      .where('album_invite.revokedAt', 'is', null)
      .where('album_invite.expiresAt', '>', new Date())
      .where('album.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  getPending(albumId: string, inviterId: string) {
    return this.db
      .selectFrom('album_invite')
      .select(['id', 'email', 'createdAt', 'expiresAt'])
      .where('albumId', '=', albumId)
      .where('inviterId', '=', inviterId)
      .where('acceptedAt', 'is', null)
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async revoke(id: string, albumId: string, inviterId: string) {
    const result = await this.db
      .updateTable('album_invite')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('albumId', '=', albumId)
      .where('inviterId', '=', inviterId)
      .where('acceptedAt', 'is', null)
      .where('revokedAt', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return Boolean(result);
  }

  async redeem(
    tokenHash: Buffer,
    dto: { name: string; password: string; quotaSizeInBytes: number | null },
  ): Promise<{ status: 'invalid' | 'existing' } | { status: 'success'; userId: string; albumId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const invite = await trx
        .selectFrom('album_invite')
        .selectAll()
        .where('tokenHash', '=', tokenHash)
        .forUpdate()
        .executeTakeFirst();
      const album = invite
        ? await trx
            .selectFrom('album')
            .select('id')
            .where('id', '=', invite.albumId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst()
        : undefined;
      if (!invite || !album || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
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
      await trx
        .insertInto('album_user')
        .values({ albumId: invite.albumId, userId: user.id, role: invite.role as AlbumUserRole })
        .onConflict((oc) => oc.columns(['albumId', 'userId']).doNothing())
        .execute();
      await trx.updateTable('album_invite').set({ acceptedAt: new Date() }).where('id', '=', invite.id).execute();

      return { status: 'success', userId: user.id, albumId: invite.albumId };
    });
  }

  async claim(
    tokenHash: Buffer,
    user: { id: string; email: string },
  ): Promise<{ status: 'invalid' } | { status: 'success'; albumId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const invite = await trx
        .selectFrom('album_invite')
        .selectAll()
        .where('tokenHash', '=', tokenHash)
        .forUpdate()
        .executeTakeFirst();
      const album = invite
        ? await trx
            .selectFrom('album')
            .select('id')
            .where('id', '=', invite.albumId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst()
        : undefined;
      if (
        !invite ||
        !album ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt < new Date() ||
        invite.email !== user.email.toLowerCase()
      ) {
        return { status: 'invalid' };
      }

      await trx
        .insertInto('album_user')
        .values({ albumId: invite.albumId, userId: user.id, role: invite.role as AlbumUserRole })
        .onConflict((oc) => oc.columns(['albumId', 'userId']).doNothing())
        .execute();
      await trx.updateTable('album_invite').set({ acceptedAt: new Date() }).where('id', '=', invite.id).execute();
      return { status: 'success', albumId: invite.albumId };
    });
  }
}
