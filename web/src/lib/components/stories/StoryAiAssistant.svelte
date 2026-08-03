<script lang="ts">
  import type { StoryAiAction, StoryAiConsent, StoryAiProviderStatus, StoryAiState } from '$lib/utils/story-ai-state';

  type Props = {
    provider: StoryAiProviderStatus;
    consent?: StoryAiConsent;
    providerFingerprint?: string;
    aiState: StoryAiState;
    actions: StoryAiAction[];
    onSaveConsent?: (consent: { textAllowed: boolean; thumbnailsAllowed: boolean }) => void;
    onAction?: (actionId: string) => void;
    onApply?: (draftId: string) => void;
    onDiscard?: (draftId: string) => void;
    onRetry?: () => void;
    onSetup?: () => void;
  };

  let {
    provider,
    consent,
    providerFingerprint,
    aiState,
    actions,
    onSaveConsent,
    onAction,
    onApply,
    onDiscard,
    onRetry,
    onSetup,
  }: Props = $props();

  let textAllowed = $state(false);
  let thumbnailsAllowed = $state(false);
  const consentCurrent = $derived(
    !!consent && !!providerFingerprint && consent.providerFingerprint === providerFingerprint && consent.textAllowed,
  );
  const busy = $derived(aiState.state === 'working' || aiState.state === 'applying');
</script>

<section class="flex flex-col gap-4" aria-labelledby="story-ai-heading" aria-busy={busy} data-story-ai-assistant>
  <header>
    <h2 id="story-ai-heading" class="text-lg font-semibold">Design with AI</h2>
    {#if provider.state === 'ready'}
      <p class="text-sm text-gray-600">
        {provider.providerName} · {provider.modelName} · {provider.billing === 'server'
          ? 'Server provided'
          : 'Your provider key'}
      </p>
    {/if}
  </header>

  {#if provider.state === 'unavailable'}
    <div role="status" class="rounded-lg bg-gray-100 p-3">AI is unavailable: {provider.reason}</div>
  {:else if provider.state === 'setup-required'}
    <div class="rounded-lg bg-gray-100 p-3">
      <p>Set up an AI provider before using the assistant. Credentials are managed outside this editor.</p>
      <button type="button" class="mt-2" onclick={onSetup}>Set up provider</button>
    </div>
  {:else if !consentCurrent}
    <form
      class="flex flex-col gap-3 rounded-lg border p-3"
      onsubmit={(event) => {
        event.preventDefault();
        onSaveConsent?.({ textAllowed, thumbnailsAllowed });
      }}
    >
      <p>
        Selected story content will be sent to {provider.providerName}. Consent applies only to this provider and can be
        changed later.
      </p>
      <label class="flex items-start gap-2">
        <input type="checkbox" required bind:checked={textAllowed} />
        Allow story text and layout details to be sent
      </label>
      <label class="flex items-start gap-2">
        <input type="checkbox" bind:checked={thumbnailsAllowed} />
        Also allow very small, metadata-stripped thumbnails to be sent
      </label>
      <button type="submit" disabled={!textAllowed}>Continue</button>
    </form>
  {:else}
    <div class="flex flex-wrap gap-2" aria-label="Suggested AI actions">
      {#each actions as action (action.id)}
        <button
          type="button"
          title={action.description}
          disabled={busy || (action.requiresThumbnails && !consent?.thumbnailsAllowed)}
          onclick={() => onAction?.(action.id)}>{action.label}</button
        >
      {/each}
    </div>

    <div aria-live="polite" aria-atomic="true">
      {#if aiState.state === 'idle'}
        <p>Choose an action to create a preview. Nothing changes until you apply it.</p>
      {:else if aiState.state === 'working'}
        <p role="status">Preparing preview: {aiState.actionLabel}</p>
      {:else if aiState.state === 'preview'}
        <article class="rounded-lg border p-3" aria-labelledby="story-ai-preview-heading">
          <h3 id="story-ai-preview-heading" class="font-semibold">Proposed changes</h3>
          <p>{aiState.draft.diff.summary}</p>
          <ul class="mt-2 list-disc pl-5">
            {#each aiState.draft.diff.changes as change}
              <li><span class="capitalize">{change.kind}</span>: {change.label}</li>
            {/each}
          </ul>
          <p class="mt-2 text-sm">Affects {aiState.draft.diff.affectedPageIds.length} pages</p>
          <div class="mt-3 flex gap-2">
            <button type="button" onclick={() => onApply?.(aiState.draft.id)}>Apply preview</button>
            <button type="button" onclick={() => onDiscard?.(aiState.draft.id)}>Discard</button>
          </div>
        </article>
      {:else if aiState.state === 'applying'}
        <p role="status">Applying the exact previewed changes…</p>
      {:else if aiState.state === 'stale'}
        <div role="alert" class="rounded-lg border border-amber-500 p-3">
          <p>{aiState.reason} The preview was not applied.</p>
          <div class="mt-2 flex gap-2">
            <button type="button" onclick={onRetry}>Create a new preview</button>
            <button type="button" onclick={() => onDiscard?.(aiState.draft.id)}>Discard</button>
          </div>
        </div>
      {:else if aiState.state === 'error'}
        <div role="alert" class="rounded-lg border border-red-500 p-3">
          <p>{aiState.message}</p>
          <button type="button" onclick={onRetry}>Try again</button>
        </div>
      {/if}
    </div>
  {/if}
</section>
