<script lang="ts">
  import { getSharedLinkActions } from '$lib/services/shared-link.service';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import type { SharedLinkResponseDto } from '@immich/sdk';
  import { ActionButton, Text } from '@immich/ui';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  type Props = {
    sharedLink: SharedLinkResponseDto;
  };

  const { sharedLink }: Props = $props();

  const sharePath = $derived(Route.viewSharedLink(sharedLink));
  const expiration = $derived(
    sharedLink.expiresAt
      ? DateTime.fromISO(sharedLink.expiresAt).toLocaleString(
          { month: 'short', day: 'numeric', year: 'numeric' },
          { locale: $locale },
        )
      : undefined,
  );

  const { Edit, Delete } = $derived(getSharedLinkActions($t, sharedLink));
</script>

<div class="flex items-center justify-between">
  <div class="flex flex-col gap-1">
    <a class="text-sm text-primary hover:underline" href={sharePath} title={sharePath}>{sharePath}</a>
    {#if expiration}
      <Text size="tiny" color="muted">Expires {expiration}</Text>
    {/if}
  </div>
  <div class="flex">
    <ActionButton action={Edit} />
    <ActionButton action={Delete} />
  </div>
</div>
