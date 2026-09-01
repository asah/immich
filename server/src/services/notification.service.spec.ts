import { defaults, SystemConfig } from 'src/config';
import { SystemConfigDto } from 'src/dtos/system-config.dto';
import { AssetFileType, JobName, JobStatus, UserMetadataKey } from 'src/enum';
import { NotificationService } from 'src/services/notification.service';
import { AlbumFactory } from 'test/factories/album.factory';
import { ActivityFactory } from 'test/factories/activity.factory';
import { AssetFileFactory } from 'test/factories/asset-file.factory';
import { AssetFactory } from 'test/factories/asset.factory';
import { UserFactory } from 'test/factories/user.factory';
import { notificationStub } from 'test/fixtures/notification.stub';
import { userStub } from 'test/fixtures/user.stub';
import { getForAlbum } from 'test/mappers';
import { newUuid } from 'test/small.factory';
import { newTestService, ServiceMocks } from 'test/utils';

const configs = {
  smtpDisabled: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: false,
      },
    },
  }),
  smtpEnabled: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: true,
      },
    },
  }),
  smtpTransport: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: true,
        transport: {
          ignoreCert: false,
          host: 'localhost',
          port: 587,
          secure: false,
          username: 'test',
          password: 'test',
        },
      },
    },
  }),
};

describe(NotificationService.name, () => {
  let sut: NotificationService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(NotificationService));
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('onConfigUpdate', () => {
    it('should emit client and server events', () => {
      const update = { oldConfig: defaults, newConfig: defaults };
      expect(sut.onConfigUpdate(update)).toBeUndefined();
      expect(mocks.websocket.clientBroadcast).toHaveBeenCalledWith('on_config_update');
      expect(mocks.websocket.serverSend).toHaveBeenCalledWith('ConfigUpdate', update);
    });
  });

  describe('onConfigValidateEvent', () => {
    it('validates smtp config when enabling smtp', async () => {
      const oldConfig = configs.smtpDisabled;
      const newConfig = configs.smtpEnabled;

      mocks.email.verifySmtp.mockResolvedValue(true);
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).toHaveBeenCalledWith(newConfig.notifications.smtp.transport);
    });

    it('validates smtp config when transport changes', async () => {
      const oldConfig = configs.smtpEnabled;
      const newConfig = configs.smtpTransport;

      mocks.email.verifySmtp.mockResolvedValue(true);
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).toHaveBeenCalledWith(newConfig.notifications.smtp.transport);
    });

    it('skips smtp validation when there are no changes', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = { ...configs.smtpEnabled };

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('skips smtp validation with DTO when there are no changes', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = configs.smtpEnabled as SystemConfigDto;

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('skips smtp validation when smtp is disabled', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = { ...configs.smtpDisabled };

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('should fail if smtp configuration is invalid', async () => {
      const oldConfig = configs.smtpDisabled;
      const newConfig = configs.smtpEnabled;

      mocks.email.verifySmtp.mockRejectedValue(new Error('Failed validating smtp'));
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).rejects.toBeInstanceOf(Error);
    });
  });

  describe('onAssetHide', () => {
    it('should send connected clients an event', () => {
      sut.onAssetHide({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_hidden', 'user-id', 'asset-id');
    });
  });

  describe('onAssetShow', () => {
    it('should queue the generate thumbnail job', async () => {
      await sut.onAssetShow({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.AssetGenerateThumbnails,
        data: { id: 'asset-id', notify: true },
      });
    });
  });

  describe('onUserSignupEvent', () => {
    it('skips when notify is false', async () => {
      await sut.onUserSignup({ id: '', notify: false });
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });

    it('should queue notify signup event if notify is true', async () => {
      await sut.onUserSignup({ id: '', notify: true });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyUserSignup,
        data: { id: '', password: undefined },
      });
    });
  });

  describe('onAlbumUpdateEvent', () => {
    it('should send a websocket event to every user and queue notify jobs for recipients', async () => {
      await sut.onAlbumUpdate({ id: 'album', userIds: ['1', '42'], recipientIds: ['42'] });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_album_update', '1', 'album');
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_album_update', '42', 'album');
      expect(mocks.job.queue).toHaveBeenCalledExactlyOnceWith({
        name: JobName.NotifyAlbumUpdate,
        data: { id: 'album', recipientId: '42', delay: 300_000 },
      });
    });

    it('should not queue email jobs when there are no recipients', async () => {
      await sut.onAlbumUpdate({ id: 'album', userIds: ['1'], recipientIds: [] });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_album_update', '1', 'album');
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });
  });

  describe('onAlbumInviteEvent', () => {
    it('should queue notify album invite event', async () => {
      await sut.onAlbumInvite({ id: '', userId: '42', senderName: 'foo' });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAlbumInvite,
        data: { id: '', recipientId: '42', senderName: 'foo' },
      });
    });
  });

  describe('onSessionDeleteEvent', () => {
    it('should send a on_session_delete client event', () => {
      vi.useFakeTimers();
      sut.onSessionDelete({ sessionId: 'id' });
      expect(mocks.websocket.clientSend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_session_delete', 'id', 'id');
    });
  });

  describe('onAssetTrash', () => {
    it('should send connected clients an websocket', () => {
      sut.onAssetTrash({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_trash', 'user-id', ['asset-id']);
    });
  });

  describe('onAssetDelete', () => {
    it('should send connected clients an event', () => {
      sut.onAssetDelete({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_delete', 'user-id', 'asset-id');
    });
  });

  describe('onAssetsTrash', () => {
    it('should send connected clients an event', () => {
      sut.onAssetsTrash({ assetIds: ['asset-id'], userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_trash', 'user-id', ['asset-id']);
    });
  });

  describe('onAssetsRestore', () => {
    it('should send connected clients an event', () => {
      sut.onAssetsRestore({ assetIds: ['asset-id'], userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_restore', 'user-id', ['asset-id']);
    });
  });

  describe('onStackCreate', () => {
    it('should send connected clients an event', () => {
      sut.onStackCreate({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStackUpdate', () => {
    it('should send connected clients an event', () => {
      sut.onStackUpdate({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStackDelete', () => {
    it('should send connected clients an event', () => {
      sut.onStackDelete({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStacksDelete', () => {
    it('should send connected clients an event', () => {
      sut.onStacksDelete({ stackIds: ['stack-id'], userId: 'user-id' });
      expect(mocks.websocket.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('handleUserSignup', () => {
    it('should skip if user could not be found', async () => {
      await expect(sut.handleUserSignup({ id: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should be successful', async () => {
      mocks.user.get.mockResolvedValue(userStub.admin);
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });

      await expect(sut.handleUserSignup({ id: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({ subject: 'Welcome to Immich' }),
      });
    });
  });

  describe('handleAlbumInvite', () => {
    it('should skip if album could not be found', async () => {
      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Skipped,
      );
      expect(mocks.user.get).not.toHaveBeenCalled();
    });

    it('should skip if recipient could not be found', async () => {
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create()));

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Skipped,
      );
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });

    it('should skip if the recipient has email notifications disabled', async () => {
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create()));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: false, albumInvite: true } },
          },
        ],
      });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Skipped,
      );
    });

    it('should skip if the recipient has email notifications for album invite disabled', async () => {
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create()));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: false } },
          },
        ],
      });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Skipped,
      );
    });

    it('should send invite email', async () => {
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create()));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Success,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({ subject: expect.stringContaining('You have been added to a shared album') }),
      });
    });

    it('should send invite email without album thumbnail if thumbnail asset does not exist', async () => {
      const album = AlbumFactory.create({ albumThumbnailAssetId: newUuid() });
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Success,
      );
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        album.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: undefined,
        }),
      });
    });

    it('should send invite email with album thumbnail as jpeg', async () => {
      const assetFile = AssetFileFactory.create({ type: AssetFileType.Thumbnail });
      const album = AlbumFactory.create({ albumThumbnailAssetId: assetFile.assetId });
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([assetFile]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Success,
      );
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        album.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: [{ filename: 'album-thumbnail.jpg', path: expect.anything(), cid: expect.anything() }],
        }),
      });
    });

    it('should send invite email with album thumbnail and arbitrary extension', async () => {
      const asset = AssetFactory.from().file({ type: AssetFileType.Thumbnail }).build();
      const album = AlbumFactory.from({ albumThumbnailAssetId: asset.id })
        .asset(asset, (builder) => builder.exif())
        .build();
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([asset.files[0]]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '', senderName: 'foo' })).resolves.toBe(
        JobStatus.Success,
      );
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        album.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: [{ filename: 'album-thumbnail.jpg', path: expect.anything(), cid: expect.anything() }],
        }),
      });
    });
  });

  describe('handleAlbumUpdate', () => {
    it('should skip if album could not be found', async () => {
      await expect(sut.handleAlbumUpdate({ id: '', recipientId: '1' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.user.get).not.toHaveBeenCalled();
    });

    it('should skip if owner could not be found', async () => {
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.from().owner({ id: 'non-existent' }).build()));

      await expect(sut.handleAlbumUpdate({ id: '', recipientId: '1' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.systemMetadata.get).not.toHaveBeenCalled();
    });

    it('should skip recipient that could not be looked up', async () => {
      const album = AlbumFactory.from().albumUser({ userId: 'non-existent' }).build();
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: 'non-existent' });
      expect(mocks.user.get).toHaveBeenCalledWith('non-existent', { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should skip recipient with disabled email notifications', async () => {
      const user = UserFactory.from()
        .metadata({
          key: UserMetadataKey.Preferences,
          value: { emailNotifications: { enabled: false, albumUpdate: true } },
        })
        .build();
      const album = AlbumFactory.from().albumUser({ userId: user.id }).build();
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue(user);
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: user.id });
      expect(mocks.user.get).toHaveBeenCalledWith(user.id, { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should skip recipient with disabled email notifications for the album update event', async () => {
      const user = UserFactory.from()
        .metadata({
          key: UserMetadataKey.Preferences,
          value: { emailNotifications: { enabled: true, albumUpdate: false } },
        })
        .build();
      const album = AlbumFactory.from().albumUser({ userId: user.id }).build();
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue(user);
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: user.id });
      expect(mocks.user.get).toHaveBeenCalledWith(user.id, { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should send email', async () => {
      const user = UserFactory.create();
      const album = AlbumFactory.from().albumUser({ userId: user.id }).build();
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.user.get.mockResolvedValue(user);
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: user.id });
      expect(mocks.user.get).toHaveBeenCalledWith(user.id, { withDeleted: false });
      expect(mocks.email.renderEmail).toHaveBeenCalled();
      expect(mocks.job.queue).toHaveBeenCalled();
    });

    it('should add new recipients for new images if job is already queued', async () => {
      await sut.onAlbumUpdate({ id: '1', userIds: ['2'], recipientIds: ['2'] });
      expect(mocks.job.removeJob).toHaveBeenCalledWith(JobName.NotifyAlbumUpdate, '1/2');
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAlbumUpdate,
        data: {
          id: '1',
          delay: 300_000,
          recipientId: '2',
        },
      });
    });
  });

  describe('shared activity notifications', () => {
    it('selects the asset owner, album owner, and prior participants, excluding the actor', async () => {
      const album = AlbumFactory.from({ id: 'album' }).build();
      const albumOwner = album.albumUsers[0].user.id;
      mocks.activity.getParticipantIds.mockResolvedValue(['actor', 'participant']);
      mocks.album.getById.mockResolvedValue(getForAlbum(album));
      mocks.asset.getByIdsWithAllRelationsButStacks.mockResolvedValue([{ ownerId: 'asset-owner' } as any]);

      await sut.onActivityCreate({ activityId: 'activity', actorId: 'actor', albumId: 'album', assetId: 'asset', isLiked: false });

      expect(mocks.job.queue).toHaveBeenCalledTimes(3);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyActivity,
        data: { id: 'album', activityId: 'activity', recipientId: 'participant', delay: 0 },
      });
      expect(mocks.job.queue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientId: albumOwner }) }));
      expect(mocks.job.queue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientId: 'asset-owner' }) }));
    });

    it('sends an immediate comment notification and email when enabled', async () => {
      const activity = ActivityFactory.create({ id: 'activity', albumId: 'album', assetId: 'asset', userId: 'actor', isLiked: false });
      const recipient = UserFactory.create({ id: 'recipient' });
      const actor = UserFactory.create({ id: 'actor', name: 'Commenter' });
      mocks.activity.getById.mockResolvedValue(activity);
      mocks.user.get.mockResolvedValueOnce(recipient).mockResolvedValueOnce(actor);
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create({ id: 'album', albumName: 'Holiday' })));
      mocks.notification.create.mockResolvedValue(notificationStub.albumEvent);
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '<html />', text: 'text' });

      await expect(sut.handleActivity({ id: 'album', activityId: 'activity', recipientId: 'recipient' })).resolves.toBe(JobStatus.Success);

      expect(mocks.notification.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'New comment', userId: 'recipient' }));
      expect(mocks.email.renderEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'activity' }));
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({ to: recipient.email, subject: 'Commenter commented on Holiday' }),
      });
    });

    it('suppresses a reaction when the recipient disabled reactions', async () => {
      const activity = ActivityFactory.create({ id: 'activity', albumId: 'album', userId: 'actor', isLiked: true });
      const recipient = UserFactory.from().metadata({
        key: UserMetadataKey.Preferences,
        value: { emailNotifications: { enabled: true, activity: true, reactions: false } },
      }).build();
      mocks.activity.getById.mockResolvedValue(activity);
      mocks.user.get.mockResolvedValueOnce(recipient).mockResolvedValueOnce(UserFactory.create({ id: 'actor' }));
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create({ id: 'album' })));

      await expect(sut.handleActivity({ id: 'album', activityId: 'activity', recipientId: recipient.id })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.notification.create).not.toHaveBeenCalled();
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('coalesces hourly activity email delivery without creating an early local notice', async () => {
      const activity = ActivityFactory.create({ id: 'activity', albumId: 'album', userId: 'actor', isLiked: false });
      const recipient = UserFactory.from().metadata({
        key: UserMetadataKey.Preferences,
        value: { emailNotifications: { frequency: 'hourly' } },
      }).build();
      mocks.activity.getById.mockResolvedValue(activity);
      mocks.user.get.mockResolvedValueOnce(recipient).mockResolvedValueOnce(UserFactory.create({ id: 'actor' }));
      mocks.album.getById.mockResolvedValue(getForAlbum(AlbumFactory.create({ id: 'album' })));

      await expect(sut.handleActivity({ id: 'album', activityId: 'activity', recipientId: recipient.id })).resolves.toBe(JobStatus.Skipped);

      expect(mocks.job.removeJob).toHaveBeenCalledWith(JobName.NotifyActivity, `album/${recipient.id}`);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyActivity,
        data: { id: 'album', activityId: 'activity', recipientId: recipient.id, delay: 3_600_000, deferred: true },
      });
      expect(mocks.notification.create).not.toHaveBeenCalled();
    });

    it('queues a non-owner description update for the photo owner', async () => {
      mocks.asset.getByIdsWithAllRelationsButStacks.mockResolvedValue([{ ownerId: 'owner' } as any]);

      await sut.onAssetDescriptionUpdate({ assetId: 'asset', actorId: 'editor' });

      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAssetDescription,
        data: { id: 'asset', recipientId: 'owner', actorId: 'editor' },
      });
    });

    it('does not notify an owner about their own description edit', async () => {
      mocks.asset.getByIdsWithAllRelationsButStacks.mockResolvedValue([{ ownerId: 'owner' } as any]);

      await sut.onAssetDescriptionUpdate({ assetId: 'asset', actorId: 'owner' });

      expect(mocks.job.queue).not.toHaveBeenCalled();
    });
  });

  describe('handleSendEmail', () => {
    it('should skip if smtp notifications are disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue({ notifications: { smtp: { enabled: false } } });
      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should send mail successfully', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        notifications: { smtp: { enabled: true, from: 'test@immich.app' } },
      });
      mocks.email.sendEmail.mockResolvedValue({ messageId: '', response: '' });

      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'test@immich.app' }));
    });

    it('should send mail with replyTo successfully', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        notifications: { smtp: { enabled: true, from: 'test@immich.app', replyTo: 'demo@immich.app' } },
      });
      mocks.email.sendEmail.mockResolvedValue({ messageId: '', response: '' });

      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'demo@immich.app' }));
    });
  });
});
