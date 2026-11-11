import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ReactionType } from 'src/dtos/activity.dto.js';
import { ActivityService } from 'src/services/activity.service.js';
import { ActivityFactory } from 'test/factories/activity.factory.js';
import { AuthFactory } from 'test/factories/auth.factory.js';
import { getForActivity } from 'test/mappers.js';
import { newUuid, newUuids } from 'test/small.factory.js';
import { ServiceMocks, newTestService } from 'test/utils.js';

describe(ActivityService.name, () => {
  let sut: ActivityService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(ActivityService));
    mocks.activity.getAssetIds.mockResolvedValue([]);
    mocks.activity.getAssetsInAlbum.mockImplementation((_albumId, assetIds) =>
      Promise.resolve(assetIds.map((assetId) => ({ assetId }))),
    );
    mocks.activity.addAssets.mockResolvedValue();
    mocks.activity.updateReaction.mockResolvedValue(undefined as never);
    mocks.activity.getById.mockResolvedValue(undefined);
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('getAll', () => {
    it('reads only direct activity for an accessible photo', async () => {
      const [assetId, userId] = newUuids();
      mocks.access.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      mocks.activity.search.mockResolvedValue([]);

      await expect(sut.getAll(AuthFactory.create({ id: userId }), { assetId })).resolves.toEqual([]);

      expect(mocks.activity.search).toHaveBeenCalledWith({ assetId, albumId: null, isLiked: undefined });
    });

    it('should get all', async () => {
      const [albumId, assetId, userId] = newUuids();

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.search.mockResolvedValue([]);

      await expect(sut.getAll(AuthFactory.create({ id: userId }), { assetId, albumId })).resolves.toEqual([]);

      expect(mocks.activity.search).toHaveBeenCalledWith({ assetId, albumId, isLiked: undefined });
    });

    it('should filter by type=like', async () => {
      const [albumId, assetId, userId] = newUuids();

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.search.mockResolvedValue([]);

      await expect(
        sut.getAll(AuthFactory.create({ id: userId }), { assetId, albumId, type: ReactionType.LIKE }),
      ).resolves.toEqual([]);

      expect(mocks.activity.search).toHaveBeenCalledWith({ assetId, albumId, isLiked: true });
    });

    it('should filter by type=comment', async () => {
      const [albumId, assetId] = newUuids();

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.search.mockResolvedValue([]);

      await expect(sut.getAll(AuthFactory.create(), { assetId, albumId, type: ReactionType.COMMENT })).resolves.toEqual(
        [],
      );

      expect(mocks.activity.search).toHaveBeenCalledWith({ assetId, albumId, isLiked: false });
    });
  });

  describe('getStatistics', () => {
    it('should get the comment and like count', async () => {
      const [albumId, assetId] = newUuids();

      mocks.activity.getStatistics.mockResolvedValue({ comments: 1, likes: 3 });
      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));

      await expect(sut.getStatistics(AuthFactory.create(), { assetId, albumId })).resolves.toEqual({
        comments: 1,
        likes: 3,
      });
    });
  });

  describe('addComment', () => {
    it('creates direct photo activity for a user who can access the photo', async () => {
      const [assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ albumId: null, assetId, userId });
      mocks.access.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));

      await sut.create(AuthFactory.create({ id: userId }), {
        assetId,
        type: ReactionType.COMMENT,
        comment: 'comment',
      });

      expect(mocks.activity.create).toHaveBeenCalledWith(expect.objectContaining({ albumId: null, assetId, userId }));
      expect(mocks.event.emit).not.toHaveBeenCalled();
    });

    it('requires a signed-in visitor to post on a shared photo', async () => {
      const assetId = newUuid();
      await expect(
        sut.create(AuthFactory.from().sharedLink().build(), {
          assetId,
          type: ReactionType.COMMENT,
          comment: 'comment',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('allows a signed-in visitor to comment on a shared album photo', async () => {
      const [albumId, assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ albumId, assetId, userId });
      mocks.access.album.checkSharedLinkAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));

      await sut.create(AuthFactory.from({ id: userId }).sharedLink().session().build(), {
        albumId,
        assetId,
        type: ReactionType.COMMENT,
        comment: 'comment',
      });

      expect(mocks.activity.create).toHaveBeenCalledWith(expect.objectContaining({ albumId, assetId, userId }));
    });

    it('should require access to the album', async () => {
      const [albumId, assetId] = newUuids();

      await expect(
        sut.create(AuthFactory.create(), { albumId, assetId, type: ReactionType.COMMENT, comment: 'comment' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should create a comment', async () => {
      const [albumId, assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ albumId, assetId, userId });

      mocks.access.activity.checkCreateAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));

      await sut.create(AuthFactory.create({ id: userId }), {
        albumId,
        assetId,
        type: ReactionType.COMMENT,
        comment: 'comment',
      });

      expect(mocks.activity.create).toHaveBeenCalledWith({
        userId: activity.userId,
        albumId: activity.albumId,
        assetId: activity.assetId,
        comment: 'comment',
        commentDocument: null,
        isLiked: false,
        parentActivityId: null,
        reactionKey: null,
      });
    });

    it('should fail because activity is disabled for the album', async () => {
      const [albumId, assetId] = newUuids();
      const activity = ActivityFactory.create({ albumId, assetId });

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));

      await expect(
        sut.create(AuthFactory.create(), { albumId, assetId, type: ReactionType.COMMENT, comment: 'comment' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should create a like', async () => {
      const [albumId, assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ userId, albumId, assetId, isLiked: true });

      mocks.access.activity.checkCreateAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));
      mocks.activity.search.mockResolvedValue([]);

      await sut.create(AuthFactory.create({ id: userId }), { albumId, assetId, type: ReactionType.LIKE });

      expect(mocks.activity.create).toHaveBeenCalledWith({
        userId: activity.userId,
        albumId,
        assetId,
        isLiked: true,
        comment: null,
        commentDocument: null,
        parentActivityId: null,
        reactionKey: ReactionType.LIKE,
      });
    });

    it('emits an activity event for a newly-created comment', async () => {
      const [albumId, assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ id: 'activity', userId, albumId, assetId, isLiked: false });
      mocks.access.activity.checkCreateAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.create.mockResolvedValue(getForActivity(activity));

      await sut.create(AuthFactory.create({ id: userId }), {
        albumId,
        assetId,
        type: ReactionType.COMMENT,
        comment: 'comment',
      });

      expect(mocks.event.emit).toHaveBeenCalledWith('ActivityCreate', {
        activityId: 'activity',
        actorId: userId,
        albumId,
        assetId,
        isLiked: false,
        parentActivityId: undefined,
      });
    });

    it('should skip if like exists', async () => {
      const [albumId, assetId] = newUuids();
      const activity = ActivityFactory.create({ albumId, assetId, isLiked: true });

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
      mocks.access.activity.checkCreateAccess.mockResolvedValue(new Set([albumId]));
      mocks.activity.search.mockResolvedValue([getForActivity(activity)]);

      await sut.create(AuthFactory.create(), { albumId, assetId, type: ReactionType.LIKE });

      expect(mocks.activity.create).not.toHaveBeenCalled();
      expect(mocks.event.emit).toHaveBeenCalledWith('ActivityCreate', expect.objectContaining({ isLiked: true }));
    });
  });

  describe('delete', () => {
    it('lets the author delete direct photo activity', async () => {
      const [assetId, userId] = newUuids();
      const activity = ActivityFactory.create({ albumId: null, assetId, userId });
      mocks.activity.getById.mockResolvedValue(activity);
      mocks.access.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      mocks.activity.delete.mockResolvedValue();

      await sut.delete(AuthFactory.create({ id: userId }), activity.id);

      expect(mocks.activity.delete).toHaveBeenCalledWith(activity.id);
    });

    it('should require access', async () => {
      await expect(sut.delete(AuthFactory.create(), newUuid())).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.activity.delete).not.toHaveBeenCalled();
    });

    it('should let the activity owner delete a comment', async () => {
      const activity = ActivityFactory.create();

      mocks.access.activity.checkOwnerAccess.mockResolvedValue(new Set([activity.id]));
      mocks.activity.delete.mockResolvedValue();

      await sut.delete(AuthFactory.create(), activity.id);

      expect(mocks.activity.delete).toHaveBeenCalledWith(activity.id);
    });

    it('should let the album owner delete a comment', async () => {
      const activity = ActivityFactory.create();

      mocks.access.activity.checkAlbumOwnerAccess.mockResolvedValue(new Set([activity.id]));
      mocks.activity.delete.mockResolvedValue();

      await sut.delete(AuthFactory.create(), activity.id);

      expect(mocks.activity.delete).toHaveBeenCalledWith(activity.id);
    });
  });
});
