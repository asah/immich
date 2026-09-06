<script lang="ts">
  import AlbumSharedLink from '$lib/components/album-page/AlbumSharedLink.svelte';
  import HeaderActionButton from '$lib/components/HeaderActionButton.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import {
    getAlbumActions,
    handleRemoveUserFromAlbum,
    handleUpdateAlbum,
    handleUpdateUserAlbumRole,
  } from '$lib/services/album.service';
  import {
    AlbumAssetSortBy,
    defaultAlbumAssetDisplayInfo,
    locale,
    SortOrder,
    type AlbumAssetDisplayInfo,
    type AlbumAssetSortCriterion,
    type AlbumAssetViewSettings,
  } from '$lib/stores/preferences.store';
  import { getAlbumPresentationSettings, toAlbumPresentation } from '$lib/utils/album-presentation';
  import {
    AlbumUserRole,
    AssetOrder,
    getAlbumInfo,
    getAllSharedLinks,
    type AlbumResponseDto,
    type SharedLinkResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import {
    Checkbox,
    Field,
    HStack,
    IconButton,
    Label,
    Modal,
    ModalBody,
    Select,
    Stack,
    Switch,
    Text,
    type SelectOption,
  } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import { mdiClose } from '@mdi/js';

  type Props = {
    album: AlbumResponseDto;
    readOnly?: boolean;
    inline?: boolean;
    onClose: () => void;
  };

  let { album, readOnly = false, inline = false, onClose }: Props = $props();

  const handleRoleSelect = async (user: UserResponseDto, role: AlbumUserRole | 'none') => {
    if (role === 'none') {
      await handleRemoveUserFromAlbum(album, user);
      return;
    }

    await handleUpdateUserAlbumRole({ albumId: album.id, userId: user.id, role });
  };

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id });
  };

  const onAlbumUserDelete = async ({ userId }: { userId: string }) => {
    album.albumUsers = album.albumUsers.filter(({ user: { id } }) => id !== userId);
    await refreshAlbum();
  };

  const onSharedLinkCreate = (sharedLink: SharedLinkResponseDto) => {
    sharedLinks.push(sharedLink);
  };

  const onSharedLinkDelete = (sharedLink: SharedLinkResponseDto) => {
    sharedLinks = sharedLinks.filter(({ id }) => sharedLink.id !== id);
  };

  const { AddUsers, CreateSharedLink } = $derived(getAlbumActions($t, album));

  let sharedLinks: SharedLinkResponseDto[] = $state([]);

  const presentationSettings = $derived(getAlbumPresentationSettings(album.presentation));
  const sortCriteria = $derived.by(() => {
    const criteria = presentationSettings.sortCriteria?.length
      ? presentationSettings.sortCriteria
      : [{ sortBy: presentationSettings.sortBy, sortOrder: presentationSettings.sortOrder }];
    return criteria.length === 1 && criteria[0].sortBy === AlbumAssetSortBy.DateTaken
      ? [{ ...criteria[0], sortOrder: album.order === AssetOrder.Asc ? SortOrder.Asc : SortOrder.Desc }]
      : criteria;
  });
  const sortByOptions = $derived(
    [
      { label: $t('date_taken'), value: AlbumAssetSortBy.DateTaken },
      { label: $t('file_name_text'), value: AlbumAssetSortBy.FileName },
      { label: $t('file_size'), value: AlbumAssetSortBy.FileSize },
      { label: 'Tag', value: AlbumAssetSortBy.Tag },
      { label: $t('camera_make_model'), value: AlbumAssetSortBy.Camera },
      { label: $t('lens_name'), value: AlbumAssetSortBy.Lens },
      { label: 'Engagement', value: AlbumAssetSortBy.Engagement },
      { label: $t('location'), value: AlbumAssetSortBy.Location },
      { label: $t('time'), value: AlbumAssetSortBy.Time },
      { label: $t('description'), value: AlbumAssetSortBy.Description },
      { label: $t('camera_settings'), value: AlbumAssetSortBy.CameraSettings },
      { label: $t('lens_settings'), value: AlbumAssetSortBy.LensSettings },
    ].sort((a, b) => a.label.localeCompare(b.label, $locale)),
  );

  const saveSortCriteria = async (criteria: AlbumAssetSortCriterion[]) => {
    if (readOnly) return;
    const [primary] = criteria;
    const settings = {
      ...presentationSettings,
      sortBy: primary.sortBy,
      sortOrder: primary.sortOrder,
      sortCriteria: criteria,
    };
    album = { ...album, presentation: toAlbumPresentation(settings) };
    const assetOrder =
      criteria.length === 1 && primary.sortBy === AlbumAssetSortBy.DateTaken
        ? primary.sortOrder === SortOrder.Asc
          ? AssetOrder.Asc
          : AssetOrder.Desc
        : undefined;
    await handleUpdateAlbum(album, { presentation: album.presentation, ...(assetOrder && { order: assetOrder }) });
  };

  const updateSortCriterion = (index: number, update: Partial<AlbumAssetSortCriterion>) => {
    void saveSortCriteria(
      sortCriteria.map((criterion, at) =>
        at === index
          ? {
              ...criterion,
              ...update,
              sortOrder:
                update.sortBy === AlbumAssetSortBy.Engagement || update.sortBy === AlbumAssetSortBy.FileSize
                  ? SortOrder.Desc
                  : (update.sortOrder ?? criterion.sortOrder),
            }
          : criterion,
      ),
    );
  };

  const displayInfoOptions: Array<{ key: keyof AlbumAssetDisplayInfo; label: string }> = $derived([
    { key: 'location', label: $t('location') },
    { key: 'date', label: $t('date_taken') },
    { key: 'time', label: $t('time') },
    { key: 'filename', label: $t('file_name_text') },
    { key: 'description', label: $t('description') },
    { key: 'fileSize', label: $t('file_size') },
    { key: 'camera', label: $t('camera_make_model') },
    { key: 'cameraSettings', label: $t('camera_settings') },
    { key: 'lens', label: $t('lens_name') },
    { key: 'lensSettings', label: $t('lens_settings') },
    { key: 'reactions', label: $t('reactions') },
  ]);

  const setDisplayInfo = (key: keyof AlbumAssetDisplayInfo, checked: boolean) => {
    if (readOnly) return;
    const settings = {
      ...presentationSettings,
      displayInfo: { ...defaultAlbumAssetDisplayInfo, ...presentationSettings.displayInfo, [key]: checked },
    };
    album = { ...album, presentation: toAlbumPresentation(settings) };
    void handleUpdateAlbum(album, { presentation: album.presentation });
  };

  const updatePresentation = (update: Partial<AlbumAssetViewSettings>) => {
    if (readOnly) return;
    const settings = { ...presentationSettings, ...update };
    album = { ...album, presentation: toAlbumPresentation(settings) };
    void handleUpdateAlbum(album, { presentation: album.presentation });
  };

  onMount(async () => {
    sharedLinks = await getAllSharedLinks({ albumId: album.id });
  });
</script>

<OnEvents
  {onAlbumUserDelete}
  onAlbumShare={refreshAlbum}
  {onSharedLinkCreate}
  {onSharedLinkDelete}
  onAlbumUpdate={(newAlbum) => (album = newAlbum)}
/>

{#snippet optionsContent()}
  <Stack gap={6}>
    <div>
      <Text size="medium" fontWeight="semi-bold">{$t('settings')}</Text>
      <div class="mt-2 grid gap-y-3 ps-2">
        <div>
          <Text size="small" fontWeight="medium">{$t('display_order')}</Text>
          <div class="flex flex-col gap-2">
            {#each sortCriteria as criterion, index (`${index}-${criterion.sortBy}`)}
              <div class="flex items-center gap-2">
                <span class="w-4 text-sm text-gray-500">{index + 1}.</span>
                <div class="min-w-0 flex-1">
                  <Select
                    value={criterion.sortBy}
                    options={sortByOptions.filter(
                      ({ value }) => value === criterion.sortBy || !sortCriteria.some(({ sortBy }) => sortBy === value),
                    )}
                    onChange={(sortBy) => updateSortCriterion(index, { sortBy: sortBy as AlbumAssetSortBy })}
                  />
                </div>
                <div class="w-32">
                  <Select
                    value={criterion.sortOrder}
                    options={[
                      { label: $t('ascending'), value: SortOrder.Asc },
                      { label: $t('descending'), value: SortOrder.Desc },
                    ]}
                    onChange={(sortOrder) => updateSortCriterion(index, { sortOrder: sortOrder as SortOrder })}
                  />
                </div>
                {#if sortCriteria.length > 1}
                  <button
                    type="button"
                    class="px-1 text-lg text-gray-500 hover:text-red-500"
                    aria-label={$t('remove')}
                    disabled={readOnly}
                    onclick={() => saveSortCriteria(sortCriteria.filter((_, at) => at !== index))}>×</button
                  >
                {/if}
              </div>
            {/each}
            {#if sortCriteria.length < 4 && sortCriteria.length < sortByOptions.length}
              <button
                type="button"
                class="self-start text-sm font-medium text-primary hover:underline"
                disabled={readOnly}
                onclick={() => {
                  const next = sortByOptions.find(({ value }) => !sortCriteria.some(({ sortBy }) => sortBy === value));
                  if (next)
                    void saveSortCriteria([
                      ...sortCriteria,
                      {
                        sortBy: next.value,
                        sortOrder:
                          next.value === AlbumAssetSortBy.Engagement || next.value === AlbumAssetSortBy.FileSize
                            ? SortOrder.Desc
                            : SortOrder.Asc,
                      },
                    ]);
                }}>+ {$t('add_sort_criterion')}</button
              >
            {/if}
          </div>
        </div>
        <Field label={$t('album_sort_dividers')} description={$t('album_sort_dividers_description')}>
          <Switch
            checked={presentationSettings.showSortDividers}
            disabled={readOnly}
            onCheckedChange={(showSortDividers) => updatePresentation({ showSortDividers })}
          />
        </Field>
        <Field label="Image row height" description="Adjust the height of photo rows in this album view.">
          <div class="flex items-center gap-3">
            <input
              class="w-full accent-immich-primary"
              type="range"
              min="100"
              max="400"
              step="5"
              value={presentationSettings.rowHeight ?? 235}
              aria-label="Image row height"
              disabled={readOnly}
              onchange={(event) => updatePresentation({ rowHeight: Number(event.currentTarget.value) })}
            />
            <output class="w-12 text-right text-sm tabular-nums">{presentationSettings.rowHeight ?? 235}px</output>
          </div>
        </Field>
        <Field label="Instant camera" description="Use white photo cards on a black gallery surface.">
          <Switch
            checked={presentationSettings.instantCameraStyle ?? false}
            disabled={readOnly}
            onCheckedChange={(instantCameraStyle) => updatePresentation({ instantCameraStyle })}
          />
        </Field>
        <div>
          <Text size="small" fontWeight="medium">{$t('display_file_info')}:</Text>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
            {#each displayInfoOptions as option (option.key)}
              <div class="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`album-display-info-${option.key}`}
                  size="tiny"
                  checked={presentationSettings.displayInfo?.[option.key] ?? false}
                  disabled={readOnly}
                  onCheckedChange={(checked) => setDisplayInfo(option.key, checked)}
                />
                <Label label={option.label} for={`album-display-info-${option.key}`} />
              </div>
            {/each}
          </div>
        </div>
        <Field label={$t('comments_and_likes')} description={$t('let_others_respond')} disabled={readOnly}>
          <Switch
            checked={album.isActivityEnabled}
            onCheckedChange={(checked) => handleUpdateAlbum(album, { isActivityEnabled: checked })}
          />
        </Field>
      </div>
    </div>

    <div>
      <HStack fullWidth class="mb-2 justify-between">
        <Text size="medium" fontWeight="semi-bold">{$t('people')}</Text>
        {#if !readOnly}
          <HeaderActionButton action={AddUsers} />
        {/if}
      </HStack>
      <div class="ps-2">
        {#each album.albumUsers as { user, role } (user.id)}
          <div class="flex items-center justify-between gap-4 py-2">
            <div class="flex flex-row items-center gap-2">
              <div>
                <UserAvatar {user} size="md" />
              </div>
              <Text size="small">{user.name}</Text>
            </div>
            <Field class="w-32" disabled={readOnly || role === AlbumUserRole.Owner}>
              <Select
                value={role}
                options={[
                  { label: $t('role_editor'), value: AlbumUserRole.Editor },
                  { label: $t('role_viewer'), value: AlbumUserRole.Viewer },
                  { label: $t('owner'), value: AlbumUserRole.Owner, disabled: true },
                  { label: $t('remove_user'), value: 'none' },
                ] as SelectOption<AlbumUserRole | 'none'>[]}
                onChange={(value) => handleRoleSelect(user, value)}
              />
            </Field>
          </div>
        {/each}
      </div>
    </div>
    {#if !readOnly}
      <div class="mb-4">
        <HStack class="mb-2 justify-between">
          <Text size="medium" fontWeight="semi-bold">{$t('shared_links')}</Text>
          <HeaderActionButton action={CreateSharedLink} />
        </HStack>

        <div class="ps-2">
          <Stack gap={4}>
            {#each sharedLinks as sharedLink (sharedLink.id)}
              <AlbumSharedLink {album} {sharedLink} />
            {/each}
          </Stack>
        </div>
      </div>
    {/if}
  </Stack>
{/snippet}

{#if inline}
  <aside
    transition:fly={{ x: 360, duration: 180 }}
    class="fixed top-(--navbar-height) inset-e-0 bottom-0 z-30 w-full overflow-y-auto border-s border-gray-200 bg-white p-5 shadow-2xl sm:w-105 dark:border-gray-700 dark:bg-immich-dark-gray"
    data-testid="album-options-panel"
    aria-label={readOnly ? $t('album') : $t('options')}
  >
    <div class="mb-5 flex items-center justify-between">
      <Text size="large" fontWeight="semi-bold">{readOnly ? $t('album') : $t('options')}</Text>
      <IconButton aria-label={$t('close')} icon={mdiClose} size="small" onclick={onClose} />
    </div>
    {@render optionsContent()}
  </aside>
{:else}
  <Modal title={readOnly ? $t('album') : $t('options')} {onClose} size="small">
    <ModalBody>
      {@render optionsContent()}
    </ModalBody>
  </Modal>
{/if}
