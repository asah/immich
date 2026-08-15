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
    AlbumAssetImageBorder,
    albumAssetViewSettings,
    defaultAlbumAssetDisplayInfo,
    SortOrder,
    type AlbumAssetDisplayInfo,
    type AlbumAssetSortCriterion,
  } from '$lib/stores/preferences.store';
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

  type Props = {
    album: AlbumResponseDto;
    readOnly?: boolean;
    onClose: () => void;
  };

  let { album, readOnly = false, onClose }: Props = $props();

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

  const sortCriteria = $derived.by(() => {
    const criteria = $albumAssetViewSettings.sortCriteria?.length
      ? $albumAssetViewSettings.sortCriteria
      : [{ sortBy: $albumAssetViewSettings.sortBy, sortOrder: $albumAssetViewSettings.sortOrder }];
    return criteria.length === 1 && criteria[0].sortBy === AlbumAssetSortBy.DateTaken
      ? [{ ...criteria[0], sortOrder: album.order === AssetOrder.Asc ? SortOrder.Asc : SortOrder.Desc }]
      : criteria;
  });
  const sortByOptions = $derived([
    { label: $t('date_taken'), value: AlbumAssetSortBy.DateTaken },
    { label: $t('file_name_text'), value: AlbumAssetSortBy.FileName },
    { label: $t('file_size'), value: AlbumAssetSortBy.FileSize },
    { label: 'Tag', value: AlbumAssetSortBy.Tag },
  ]);

  const imageBorderOptions = $derived([
    { label: $t('image_border_none'), value: AlbumAssetImageBorder.None },
    { label: $t('image_border_thin'), value: AlbumAssetImageBorder.Thin },
    { label: $t('image_border_thick'), value: AlbumAssetImageBorder.Thick },
  ]);

  const saveSortCriteria = async (criteria: AlbumAssetSortCriterion[]) => {
    const [primary] = criteria;
    $albumAssetViewSettings = {
      ...$albumAssetViewSettings,
      sortBy: primary.sortBy,
      sortOrder: primary.sortOrder,
      sortCriteria: criteria,
    };
    if (criteria.length === 1 && primary.sortBy === AlbumAssetSortBy.DateTaken) {
      const assetOrder = primary.sortOrder === SortOrder.Asc ? AssetOrder.Asc : AssetOrder.Desc;
      if (album.order !== assetOrder) await handleUpdateAlbum(album, { order: assetOrder });
    }
  };

  const updateSortCriterion = (index: number, update: Partial<AlbumAssetSortCriterion>) => {
    void saveSortCriteria(
      sortCriteria.map((criterion, at) => (at === index ? { ...criterion, ...update } : criterion)),
    );
  };

  const displayInfoOptions: Array<{ key: keyof AlbumAssetDisplayInfo; label: string }> = $derived([
    { key: 'location', label: $t('location') },
    { key: 'date', label: $t('date_taken') },
    { key: 'time', label: $t('time') },
    { key: 'filename', label: $t('file_name_text') },
    { key: 'fileSize', label: $t('file_size') },
    { key: 'camera', label: $t('camera_make_model') },
    { key: 'cameraSettings', label: $t('camera_settings') },
    { key: 'lens', label: $t('lens_name') },
    { key: 'lensSettings', label: $t('lens_settings') },
  ]);

  const setDisplayInfo = (key: keyof AlbumAssetDisplayInfo, checked: boolean) => {
    const displayInfo = { ...defaultAlbumAssetDisplayInfo, ...$albumAssetViewSettings.displayInfo, [key]: checked };
    $albumAssetViewSettings = { ...$albumAssetViewSettings, displayInfo };
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

<Modal title={readOnly ? $t('album') : $t('options')} {onClose} size="small">
  <ModalBody>
    <Stack gap={6}>
      <div>
        <Text size="medium" fontWeight="semi-bold">{$t('settings')}</Text>
        <div class="mt-2 grid gap-y-3 ps-2">
          <Field label={$t('display_order')} disabled={readOnly}>
            <div class="flex flex-col gap-2">
              {#each sortCriteria as criterion, index (`${index}-${criterion.sortBy}`)}
                <div class="flex items-center gap-2">
                  <span class="w-4 text-sm text-gray-500">{index + 1}.</span>
                  <div class="min-w-0 flex-1">
                    <Select
                      value={criterion.sortBy}
                      options={sortByOptions.filter(
                        ({ value }) =>
                          value === criterion.sortBy || !sortCriteria.some(({ sortBy }) => sortBy === value),
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
                      onclick={() => saveSortCriteria(sortCriteria.filter((_, at) => at !== index))}>×</button
                    >
                  {/if}
                </div>
              {/each}
              {#if sortCriteria.length < 4 && sortCriteria.length < sortByOptions.length}
                <button
                  type="button"
                  class="self-start text-sm font-medium text-primary hover:underline"
                  onclick={() => {
                    const next = sortByOptions.find(
                      ({ value }) => !sortCriteria.some(({ sortBy }) => sortBy === value),
                    );
                    if (next)
                      void saveSortCriteria([...sortCriteria, { sortBy: next.value, sortOrder: SortOrder.Asc }]);
                  }}>+ {$t('add_sort_criterion')}</button
                >
              {/if}
            </div>
          </Field>
          <Field label={$t('album_sort_dividers')} description={$t('album_sort_dividers_description')}>
            <Switch
              checked={$albumAssetViewSettings.showSortDividers}
              onCheckedChange={(showSortDividers) =>
                ($albumAssetViewSettings = { ...$albumAssetViewSettings, showSortDividers })}
            />
          </Field>
          <Field
            label={$t('album_image_border')}
            description={$t('album_image_border_description')}
            disabled={readOnly}
          >
            <Select
              value={$albumAssetViewSettings.imageBorder}
              options={imageBorderOptions}
              onChange={(imageBorder) =>
                ($albumAssetViewSettings = {
                  ...$albumAssetViewSettings,
                  imageBorder: imageBorder as AlbumAssetImageBorder,
                })}
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
                    checked={$albumAssetViewSettings.displayInfo?.[option.key] ?? false}
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
  </ModalBody>
</Modal>
