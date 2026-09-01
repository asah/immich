<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { updateMyPreferences } from '@immich/sdk';
  import { Button, Field, Switch, toastManager } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';

  let emailNotificationsEnabled = $state(authManager.preferences.emailNotifications?.enabled ?? true);
  let albumInviteNotificationEnabled = $state(authManager.preferences.emailNotifications?.albumInvite ?? true);
  let albumUpdateNotificationEnabled = $state(authManager.preferences.emailNotifications?.albumUpdate ?? true);
  let activityNotificationEnabled = $state(authManager.preferences.emailNotifications?.activity ?? true);
  let commentNotificationEnabled = $state(authManager.preferences.emailNotifications?.comments ?? true);
  let reactionNotificationEnabled = $state(authManager.preferences.emailNotifications?.reactions ?? true);
  let descriptionNotificationEnabled = $state(authManager.preferences.emailNotifications?.descriptions ?? true);
  let notificationFrequency = $state(authManager.preferences.emailNotifications?.frequency ?? 'immediate');

  const handleSave = async () => {
    try {
      const response = await updateMyPreferences({
        userPreferencesUpdateDto: {
          emailNotifications: {
            enabled: emailNotificationsEnabled,
            albumInvite: emailNotificationsEnabled && albumInviteNotificationEnabled,
            albumUpdate: emailNotificationsEnabled && albumUpdateNotificationEnabled,
            activity: emailNotificationsEnabled && activityNotificationEnabled,
            comments: emailNotificationsEnabled && activityNotificationEnabled && commentNotificationEnabled,
            descriptions: emailNotificationsEnabled && descriptionNotificationEnabled,
            reactions: emailNotificationsEnabled && activityNotificationEnabled && reactionNotificationEnabled,
            frequency: notificationFrequency,
          },
        },
      });

      authManager.setPreferences(response);
      toastManager.primary($t('saved_settings'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_settings'));
    }
  };

  const onsubmit = (event: Event) => {
    event.preventDefault();
  };

  const disabled = $derived(!emailNotificationsEnabled);
</script>

<section class="my-4">
  <div in:fade={{ duration: 500 }}>
    <form autocomplete="off" {onsubmit}>
      <div class="flex flex-col gap-6 sm:ms-8">
        <Field label={$t('enable')} description={$t('notification_toggle_setting_description')}>
          <Switch bind:checked={emailNotificationsEnabled} />
        </Field>

        <Field label={$t('album_added')} description={$t('album_added_notification_setting_description')} {disabled}>
          <Switch bind:checked={albumInviteNotificationEnabled} />
        </Field>

        <Field label={$t('album_updated')} description={$t('album_updated_setting_description')} {disabled}>
          <Switch bind:checked={albumUpdateNotificationEnabled} />
        </Field>

        <Field label="Shared photo and album activity" description="Owners are notified by default; participants receive relevant replies and updates." {disabled}>
          <Switch bind:checked={activityNotificationEnabled} />
        </Field>

        <Field label="Comments" description="Comments and replies on shared photos and albums." disabled={disabled || !activityNotificationEnabled}>
          <Switch bind:checked={commentNotificationEnabled} />
        </Field>

        <Field label="Reactions" description="Reactions on shared photos and albums." disabled={disabled || !activityNotificationEnabled}>
          <Switch bind:checked={reactionNotificationEnabled} />
        </Field>

        <Field label="Photo description changes" description="A non-owner changed the description of one of your photos." {disabled}>
          <Switch bind:checked={descriptionNotificationEnabled} />
        </Field>

        <Field label="Email delivery" description="Immediate sends each notice; hourly and daily coalesce updates for the same item." {disabled}>
          <select class="immich-form-select" bind:value={notificationFrequency}>
            <option value="immediate">Immediately</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </select>
        </Field>
      </div>

      <div class="mt-4 flex justify-end">
        <Button shape="round" type="submit" size="small" onclick={() => handleSave()}>{$t('save')}</Button>
      </div>
    </form>
  </div>
</section>
