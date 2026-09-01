import { BadRequestException, Injectable } from '@nestjs/common';
import { OnEvent, OnJob } from 'src/decorators';
import { MapAlbumDto } from 'src/dtos/album.dto';
import { mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  mapNotification,
  NotificationDeleteAllDto,
  NotificationDto,
  NotificationSearchDto,
  NotificationUpdateAllDto,
  NotificationUpdateDto,
} from 'src/dtos/notification.dto';
import { SystemConfigSmtpDto } from 'src/dtos/system-config.dto';
import {
  AssetFileType,
  JobName,
  JobStatus,
  NotificationLevel,
  NotificationType,
  Permission,
  QueueName,
} from 'src/enum';
import { EmailTemplate } from 'src/repositories/email.repository';
import { ArgOf } from 'src/repositories/event.repository';
import { BaseService } from 'src/services/base.service';
import { EmailImageAttachment, JobOf } from 'src/types';
import { getFilenameExtension } from 'src/utils/file';
import { getExternalDomain } from 'src/utils/misc';
import { isEqualObject } from 'src/utils/object';
import { getPreferences } from 'src/utils/preferences';

@Injectable()
export class NotificationService extends BaseService {
  private static albumUpdateEmailDelayMs = 300_000;

  async search(auth: AuthDto, dto: NotificationSearchDto): Promise<NotificationDto[]> {
    const items = await this.notificationRepository.search(auth.user.id, dto);
    return items.map((item) => mapNotification(item));
  }

  async updateAll(auth: AuthDto, dto: NotificationUpdateAllDto) {
    await this.requireAccess({ auth, ids: dto.ids, permission: Permission.NotificationUpdate });
    await this.notificationRepository.updateAll(dto.ids, {
      readAt: dto.readAt,
    });
  }

  async deleteAll(auth: AuthDto, dto: NotificationDeleteAllDto) {
    await this.requireAccess({ auth, ids: dto.ids, permission: Permission.NotificationDelete });
    await this.notificationRepository.deleteAll(dto.ids);
  }

  async get(auth: AuthDto, id: string) {
    await this.requireAccess({ auth, ids: [id], permission: Permission.NotificationRead });
    const item = await this.notificationRepository.get(id);
    if (!item) {
      throw new BadRequestException('Notification not found');
    }
    return mapNotification(item);
  }

  async update(auth: AuthDto, id: string, dto: NotificationUpdateDto) {
    await this.requireAccess({ auth, ids: [id], permission: Permission.NotificationUpdate });
    const item = await this.notificationRepository.update(id, {
      readAt: dto.readAt,
    });
    return mapNotification(item);
  }

  async delete(auth: AuthDto, id: string) {
    await this.requireAccess({ auth, ids: [id], permission: Permission.NotificationDelete });
    await this.notificationRepository.delete(id);
  }

  @OnJob({ name: JobName.NotificationsCleanup, queue: QueueName.BackgroundTask })
  async onNotificationsCleanup() {
    await this.notificationRepository.cleanup();
  }

  @OnEvent({ name: 'JobError' })
  async onJobError({ job, error }: ArgOf<'JobError'>) {
    const admin = await this.userRepository.getAdmin();
    if (!admin) {
      return;
    }

    this.logger.error(`Unable to run job handler (${job.name}): ${error}`, error?.stack, JSON.stringify(job.data));

    switch (job.name) {
      case JobName.DatabaseBackup: {
        const errorMessage = error instanceof Error ? error.message : error;
        const item = await this.notificationRepository.create({
          userId: admin.id,
          type: NotificationType.JobFailed,
          level: NotificationLevel.Error,
          title: 'Job Failed',
          description: `Job ${[job.name]} failed with error: ${errorMessage}`,
        });

        this.websocketRepository.clientSend('on_notification', admin.id, mapNotification(item));
        break;
      }

      default: {
        return;
      }
    }
  }

  @OnEvent({ name: 'ConfigUpdate' })
  onConfigUpdate({ oldConfig, newConfig }: ArgOf<'ConfigUpdate'>) {
    this.websocketRepository.clientBroadcast('on_config_update');
    this.websocketRepository.serverSend('ConfigUpdate', { oldConfig, newConfig });
  }

  @OnEvent({ name: 'AppRestart' })
  onAppRestart(state: ArgOf<'AppRestart'>) {
    this.websocketRepository.clientBroadcast('AppRestartV1', {
      isMaintenanceMode: state.isMaintenanceMode,
    });

    this.websocketRepository.serverSend('AppRestart', state);
  }

  @OnEvent({ name: 'ConfigValidate', priority: -100 })
  async onConfigValidate({ oldConfig, newConfig }: ArgOf<'ConfigValidate'>) {
    try {
      if (
        newConfig.notifications.smtp.enabled &&
        !isEqualObject(oldConfig.notifications.smtp, newConfig.notifications.smtp)
      ) {
        await this.emailRepository.verifySmtp(newConfig.notifications.smtp.transport);
      }
    } catch (error: Error | any) {
      this.logger.error(`Failed to validate SMTP configuration: ${error}`, error?.stack);
      throw new Error('Invalid SMTP configuration', { cause: error });
    }
  }

  @OnEvent({ name: 'AssetHide' })
  onAssetHide({ assetId, userId }: ArgOf<'AssetHide'>) {
    this.websocketRepository.clientSend('on_asset_hidden', userId, assetId);
  }

  @OnEvent({ name: 'AssetShow' })
  async onAssetShow({ assetId }: ArgOf<'AssetShow'>) {
    await this.jobRepository.queue({ name: JobName.AssetGenerateThumbnails, data: { id: assetId, notify: true } });
  }

  @OnEvent({ name: 'AssetTrash' })
  onAssetTrash({ assetId, userId }: ArgOf<'AssetTrash'>) {
    this.websocketRepository.clientSend('on_asset_trash', userId, [assetId]);
  }

  @OnEvent({ name: 'AssetDelete' })
  onAssetDelete({ assetId, userId }: ArgOf<'AssetDelete'>) {
    this.websocketRepository.clientSend('on_asset_delete', userId, assetId);
  }

  @OnEvent({ name: 'AssetTrashAll' })
  onAssetsTrash({ assetIds, userId }: ArgOf<'AssetTrashAll'>) {
    this.websocketRepository.clientSend('on_asset_trash', userId, assetIds);
  }

  @OnEvent({ name: 'AssetMetadataExtracted' })
  async onAssetMetadataExtracted({ assetId, userId, source }: ArgOf<'AssetMetadataExtracted'>) {
    if (source !== 'sidecar-write') {
      return;
    }

    const [asset] = await this.assetRepository.getByIdsWithAllRelationsButStacks([assetId]);
    if (asset) {
      this.websocketRepository.clientSend(
        'on_asset_update',
        userId,
        mapAsset(asset, { auth: { user: { id: userId } } as AuthDto }),
      );
    }
  }

  @OnEvent({ name: 'AssetDescriptionUpdate' })
  async onAssetDescriptionUpdate({ assetId, actorId }: ArgOf<'AssetDescriptionUpdate'>) {
    const [asset] = await this.assetRepository.getByIdsWithAllRelationsButStacks([assetId]);
    if (!asset || asset.ownerId === actorId) return;
    await this.jobRepository.queue({
      name: JobName.NotifyAssetDescription,
      data: { id: assetId, recipientId: asset.ownerId, actorId },
    });
  }

  @OnEvent({ name: 'AssetRestoreAll' })
  onAssetsRestore({ assetIds, userId }: ArgOf<'AssetRestoreAll'>) {
    this.websocketRepository.clientSend('on_asset_restore', userId, assetIds);
  }

  @OnEvent({ name: 'StackCreate' })
  onStackCreate({ userId }: ArgOf<'StackCreate'>) {
    this.websocketRepository.clientSend('on_asset_stack_update', userId);
  }

  @OnEvent({ name: 'StackUpdate' })
  onStackUpdate({ userId }: ArgOf<'StackUpdate'>) {
    this.websocketRepository.clientSend('on_asset_stack_update', userId);
  }

  @OnEvent({ name: 'StackDelete' })
  onStackDelete({ userId }: ArgOf<'StackDelete'>) {
    this.websocketRepository.clientSend('on_asset_stack_update', userId);
  }

  @OnEvent({ name: 'StackDeleteAll' })
  onStacksDelete({ userId }: ArgOf<'StackDeleteAll'>) {
    this.websocketRepository.clientSend('on_asset_stack_update', userId);
  }

  @OnEvent({ name: 'UserSignup' })
  async onUserSignup({ notify, id, password: password }: ArgOf<'UserSignup'>) {
    if (notify) {
      await this.jobRepository.queue({ name: JobName.NotifyUserSignup, data: { id, password } });
    }
  }

  @OnEvent({ name: 'UserDelete' })
  onUserDelete({ id }: ArgOf<'UserDelete'>) {
    this.websocketRepository.clientBroadcast('on_user_delete', id);
  }

  @OnEvent({ name: 'AlbumUpdate' })
  async onAlbumUpdate({ id, userIds, recipientIds }: ArgOf<'AlbumUpdate'>) {
    for (const userId of userIds) {
      this.websocketRepository.clientSend('on_album_update', userId, id);
    }

    for (const recipientId of recipientIds) {
      await this.jobRepository.removeJob(JobName.NotifyAlbumUpdate, `${id}/${recipientId}`);
      await this.jobRepository.queue({
        name: JobName.NotifyAlbumUpdate,
        data: { id, recipientId, delay: NotificationService.albumUpdateEmailDelayMs },
      });
    }
  }

  @OnEvent({ name: 'AlbumInvite' })
  async onAlbumInvite({ id, userId, senderName }: ArgOf<'AlbumInvite'>) {
    await this.jobRepository.queue({ name: JobName.NotifyAlbumInvite, data: { id, recipientId: userId, senderName } });
  }

  @OnEvent({ name: 'ActivityCreate' })
  async onActivityCreate({ activityId, actorId, albumId, assetId, isLiked, parentActivityId }: ArgOf<'ActivityCreate'>) {
    const recipientIds = new Set<string>(await this.activityRepository.getParticipantIds(albumId, assetId));
    const album = await this.albumRepository.getById(albumId, { withAssets: false });
    for (const albumUser of album?.albumUsers ?? []) {
      if (albumUser.role === 'owner') recipientIds.add(albumUser.user.id);
    }
    if (assetId) {
      const [asset] = await this.assetRepository.getByIdsWithAllRelationsButStacks([assetId]);
      if (asset) recipientIds.add(asset.ownerId);
    }
    if (parentActivityId) {
      const parent = await this.activityRepository.getById(parentActivityId);
      if (parent) recipientIds.add(parent.userId);
    }
    recipientIds.delete(actorId);
    for (const recipientId of recipientIds) {
      await this.jobRepository.removeJob(JobName.NotifyActivity, `${albumId}/${recipientId}`);
      await this.jobRepository.queue({ name: JobName.NotifyActivity, data: { id: albumId, activityId, recipientId, delay: 0 } });
    }
  }

  @OnEvent({ name: 'SessionDelete' })
  onSessionDelete({ sessionId }: ArgOf<'SessionDelete'>) {
    // after the response is sent
    setTimeout(() => this.websocketRepository.clientSend('on_session_delete', sessionId, sessionId), 500);
  }

  async sendTestEmail(id: string, dto: SystemConfigSmtpDto, tempTemplate?: string) {
    const user = await this.userRepository.get(id, { withDeleted: false });
    if (!user) {
      throw new Error('User not found');
    }

    try {
      await this.emailRepository.verifySmtp(dto.transport);
    } catch (error) {
      throw new BadRequestException('Failed to verify SMTP configuration', { cause: error });
    }

    const { server } = await this.getConfig({ withCache: false });
    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.TEST_EMAIL,
      data: {
        baseUrl: getExternalDomain(server),
        displayName: user.name,
      },
      customTemplate: tempTemplate!,
    });
    const { messageId } = await this.emailRepository.sendEmail({
      to: user.email,
      subject: 'Test email from Immich',
      html,
      text,
      from: dto.from,
      replyTo: dto.replyTo || dto.from,
      smtp: dto.transport,
    });

    return { messageId };
  }

  @OnJob({ name: JobName.NotifyUserSignup, queue: QueueName.Notification })
  async handleUserSignup({ id, password }: JobOf<JobName.NotifyUserSignup>) {
    const user = await this.userRepository.get(id, { withDeleted: false });
    if (!user) {
      return JobStatus.Skipped;
    }

    const { server, templates } = await this.getConfig({ withCache: true });
    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.WELCOME,
      data: {
        baseUrl: getExternalDomain(server),
        displayName: user.name,
        username: user.email,
        password,
      },
      customTemplate: templates.email.welcomeTemplate,
    });

    await this.jobRepository.queue({
      name: JobName.SendMail,
      data: {
        to: user.email,
        subject: 'Welcome to Immich',
        html,
        text,
      },
    });

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.NotifyAlbumInvite, queue: QueueName.Notification })
  async handleAlbumInvite({ id, recipientId, senderName }: JobOf<JobName.NotifyAlbumInvite>) {
    const album = await this.albumRepository.getById(id, { withAssets: false });
    if (!album) {
      return JobStatus.Skipped;
    }

    const recipient = await this.userRepository.get(recipientId, { withDeleted: false });
    if (!recipient) {
      return JobStatus.Skipped;
    }

    await this.sendAlbumLocalNotification(album, recipientId, NotificationType.AlbumInvite, senderName);

    const { emailNotifications } = getPreferences(recipient.metadata);

    if (!emailNotifications.enabled || !emailNotifications.albumInvite) {
      return JobStatus.Skipped;
    }

    const attachment = await this.getAlbumThumbnailAttachment(album);

    const { server, templates } = await this.getConfig({ withCache: false });
    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.ALBUM_INVITE,
      data: {
        baseUrl: getExternalDomain(server),
        albumId: album.id,
        albumName: album.albumName,
        senderName,
        recipientName: recipient.name,
        cid: attachment ? attachment.cid : undefined,
      },
      customTemplate: templates.email.albumInviteTemplate,
    });

    await this.jobRepository.queue({
      name: JobName.SendMail,
      data: {
        to: recipient.email,
        subject: `You have been added to a shared album - ${album.albumName}`,
        html,
        text,
        imageAttachments: attachment ? [attachment] : undefined,
      },
    });

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.NotifyAlbumUpdate, queue: QueueName.Notification })
  async handleAlbumUpdate({ id, recipientId }: JobOf<JobName.NotifyAlbumUpdate>) {
    const album = await this.albumRepository.getById(id, { withAssets: false });

    if (!album) {
      return JobStatus.Skipped;
    }

    const recipient = await this.userRepository.get(recipientId, { withDeleted: false });
    if (!recipient) {
      return JobStatus.Skipped;
    }

    await this.sendAlbumLocalNotification(album, recipientId, NotificationType.AlbumUpdate);

    const attachment = await this.getAlbumThumbnailAttachment(album);

    const { server, templates } = await this.getConfig({ withCache: false });

    const user = await this.userRepository.get(recipientId, { withDeleted: false });
    if (!user) {
      return JobStatus.Skipped;
    }

    const { emailNotifications } = getPreferences(user.metadata);

    if (!emailNotifications.enabled || !emailNotifications.albumUpdate) {
      return JobStatus.Skipped;
    }

    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.ALBUM_UPDATE,
      data: {
        baseUrl: getExternalDomain(server),
        albumId: album.id,
        albumName: album.albumName,
        recipientName: user.name,
        cid: attachment ? attachment.cid : undefined,
      },
      customTemplate: templates.email.albumUpdateTemplate,
    });

    await this.jobRepository.queue({
      name: JobName.SendMail,
      data: {
        to: user.email,
        subject: `New media has been added to an album - ${album.albumName}`,
        html,
        text,
        imageAttachments: attachment ? [attachment] : undefined,
      },
    });

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.NotifyActivity, queue: QueueName.Notification })
  async handleActivity({ id: albumId, activityId, recipientId, deferred }: JobOf<JobName.NotifyActivity>) {
    const [activity, recipient, album] = await Promise.all([
      this.activityRepository.getById(activityId),
      this.userRepository.get(recipientId, { withDeleted: false }),
      this.albumRepository.getById(albumId, { withAssets: false }),
    ]);
    if (!activity || !recipient || !album || activity.userId === recipientId) return JobStatus.Skipped;
    const actor = await this.userRepository.get(activity.userId, { withDeleted: false });
    if (!actor) return JobStatus.Skipped;
    const { emailNotifications } = getPreferences(recipient.metadata);
    const enabledForType = activity.isLiked ? emailNotifications.reactions : emailNotifications.comments;
    if (!emailNotifications.enabled || !emailNotifications.activity || !enabledForType) return JobStatus.Skipped;

    const delay = { immediate: 0, hourly: 3_600_000, daily: 86_400_000 }[emailNotifications.frequency];
    if (delay > 0 && !deferred) {
      await this.jobRepository.removeJob(JobName.NotifyActivity, `${albumId}/${recipientId}`);
      await this.jobRepository.queue({ name: JobName.NotifyActivity, data: { id: albumId, activityId, recipientId, delay, deferred: true } });
      return JobStatus.Skipped;
    }
    const item = await this.notificationRepository.create({
      userId: recipientId, type: NotificationType.Activity, level: NotificationLevel.Info,
      title: activity.isLiked ? 'New reaction' : 'New comment',
      description: `${actor.name} ${activity.isLiked ? 'reacted to' : 'commented on'} ${album.albumName}`,
      data: JSON.stringify({ albumId, assetId: activity.assetId }),
    });
    this.websocketRepository.clientSend('on_notification', recipientId, mapNotification(item));
    const { server } = await this.getConfig({ withCache: false });
    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.ACTIVITY,
      data: { baseUrl: getExternalDomain(server), albumId, albumName: album.albumName, actorName: actor.name, recipientName: recipient.name, activity: activity.isLiked ? 'reacted to' : 'commented on', assetId: activity.assetId ?? undefined },
      customTemplate: '',
    });
    await this.jobRepository.queue({ name: JobName.SendMail, data: { to: recipient.email, subject: `${actor.name} ${activity.isLiked ? 'reacted to' : 'commented on'} ${album.albumName}`, html, text } });
    return JobStatus.Success;
  }

  @OnJob({ name: JobName.NotifyAssetDescription, queue: QueueName.Notification })
  async handleAssetDescription({ id, recipientId, actorId }: JobOf<JobName.NotifyAssetDescription>) {
    const [[asset], recipient, actor] = await Promise.all([
      this.assetRepository.getByIdsWithAllRelationsButStacks([id]),
      this.userRepository.get(recipientId, { withDeleted: false }),
      this.userRepository.get(actorId, { withDeleted: false }),
    ]);
    if (!asset || !recipient || !actor || recipientId === actorId) return JobStatus.Skipped;
    const { emailNotifications } = getPreferences(recipient.metadata);
    if (!emailNotifications.enabled || !emailNotifications.descriptions) return JobStatus.Skipped;
    const item = await this.notificationRepository.create({
      userId: recipientId, type: NotificationType.AssetUpdate, level: NotificationLevel.Info,
      title: 'Photo description updated', description: `${actor.name} updated a photo description`, data: JSON.stringify({ assetId: id }),
    });
    this.websocketRepository.clientSend('on_notification', recipientId, mapNotification(item));
    const { server } = await this.getConfig({ withCache: false });
    const { html, text } = await this.emailRepository.renderEmail({
      template: EmailTemplate.ACTIVITY,
      data: { baseUrl: getExternalDomain(server), albumId: id, albumName: 'a photo', actorName: actor.name, recipientName: recipient.name, activity: 'updated the description of', itemPath: `/photos/${id}` },
      customTemplate: '',
    });
    await this.jobRepository.queue({ name: JobName.SendMail, data: { to: recipient.email, subject: `${actor.name} updated a photo description`, html, text } });
    return JobStatus.Success;
  }

  @OnJob({ name: JobName.SendMail, queue: QueueName.Notification })
  async handleSendEmail(data: JobOf<JobName.SendMail>): Promise<JobStatus> {
    const { notifications } = await this.getConfig({ withCache: false });
    if (!notifications.smtp.enabled) {
      return JobStatus.Skipped;
    }

    const { to, subject, html, text: plain } = data;
    const response = await this.emailRepository.sendEmail({
      to,
      subject,
      html,
      text: plain,
      from: notifications.smtp.from,
      replyTo: notifications.smtp.replyTo || notifications.smtp.from,
      smtp: notifications.smtp.transport,
      imageAttachments: data.imageAttachments,
    });

    this.logger.log(`Sent mail with id: ${response.messageId} status: ${response.response}`);

    return JobStatus.Success;
  }

  private async getAlbumThumbnailAttachment(album: {
    albumThumbnailAssetId: string | null;
  }): Promise<EmailImageAttachment | undefined> {
    if (!album.albumThumbnailAssetId) {
      return;
    }

    const albumThumbnailFiles = await this.assetJobRepository.getAlbumThumbnailFiles(
      album.albumThumbnailAssetId,
      AssetFileType.Thumbnail,
    );

    if (albumThumbnailFiles.length !== 1) {
      return;
    }

    return {
      filename: `album-thumbnail${getFilenameExtension(albumThumbnailFiles[0].path)}`,
      path: albumThumbnailFiles[0].path,
      cid: 'album-thumbnail',
    };
  }

  private async sendAlbumLocalNotification(
    album: MapAlbumDto,
    userId: string,
    type: NotificationType.AlbumInvite | NotificationType.AlbumUpdate,
    senderName?: string,
  ) {
    const isInvite = type === NotificationType.AlbumInvite;
    const item = await this.notificationRepository.create({
      userId,
      type,
      level: isInvite ? NotificationLevel.Success : NotificationLevel.Info,
      title: isInvite ? 'Shared Album Invitation' : 'Shared Album Update',
      description: isInvite
        ? `${senderName} shared an album (${album.albumName}) with you`
        : `New media has been added to the album (${album.albumName})`,
      data: JSON.stringify({ albumId: album.id }),
    });

    this.websocketRepository.clientSend('on_notification', userId, mapNotification(item));
  }
}
