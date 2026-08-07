<script lang="ts">
  import { Button, Field } from '@immich/ui';
  import { mdiFormatBold, mdiFormatItalic, mdiFormatUnderline, mdiLink, mdiPalette } from '@mdi/js';
  import { Icon } from '@immich/ui';

  type Props = { value?: string; label?: string };
  let { value = $bindable(''), label = '' }: Props = $props();
  let editor = $state<HTMLDivElement>();
  let color = $state('#111827');

  const command = (name: string, argument?: string) => {
    editor?.focus();
    document.execCommand(name, false, argument);
    value = editor?.innerHTML ?? '';
  };

  const addLink = () => {
    const url = prompt('URL');
    if (url) command('createLink', url);
  };
</script>

<Field {label}>
  <div class="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
    <div class="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
      <Button size="small" variant="ghost" aria-label="Bold" onclick={() => command('bold')}><Icon icon={mdiFormatBold} /></Button>
      <Button size="small" variant="ghost" aria-label="Italic" onclick={() => command('italic')}><Icon icon={mdiFormatItalic} /></Button>
      <Button size="small" variant="ghost" aria-label="Underline" onclick={() => command('underline')}><Icon icon={mdiFormatUnderline} /></Button>
      <Button size="small" variant="ghost" aria-label="Link" onclick={addLink}><Icon icon={mdiLink} /></Button>
      <label class="flex items-center px-2" title="Text color">
        <Icon icon={mdiPalette} size="18" />
        <input aria-label="Text color" type="color" bind:value={color} onchange={() => command('foreColor', color)} />
      </label>
      <label class="flex items-center px-2" title="Background color">
        <input aria-label="Background color" type="color" value="#fff59d" onchange={(event) => command('hiliteColor', event.currentTarget.value)} />
      </label>
    </div>
    <div
      bind:this={editor}
      class="min-h-24 p-3 outline-none"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      oninput={() => (value = editor?.innerHTML ?? '')}
      onblur={() => (value = editor?.innerHTML ?? '')}
    >{@html value}</div>
  </div>
</Field>
