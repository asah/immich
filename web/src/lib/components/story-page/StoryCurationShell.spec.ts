import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StoryCurationShell from './StoryCurationShell.svelte';

describe('StoryCurationShell', () => {
  it('exposes curation states and used status without drag interactions', async () => {
    const items = [
      { id: 'asset-used', used: true, state: 'include' as const },
      { id: 'asset-unplaced', used: false, state: 'maybe' as const },
    ];
    render(StoryCurationShell, { items });
    expect(screen.getAllByText('Photo')).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'story_curation_unplaced' }));
    expect(screen.getAllByText('Photo')).toHaveLength(1);
  });

  it('keeps controls touch-sized in the responsive list', () => {
    const { container } = render(StoryCurationShell, { items: [{ id: 'asset', used: false, state: 'include' }] });
    expect(container.querySelector('li')).toHaveClass('min-h-11');
  });
});
