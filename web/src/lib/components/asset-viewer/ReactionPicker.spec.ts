import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ReactionPicker from './ReactionPicker.svelte';

describe('ReactionPicker', () => {
  it('offers popular reactions immediately and the expanded catalog on demand', async () => {
    const user = userEvent.setup();
    render(ReactionPicker, { props: { onSelect: vi.fn() } });

    await user.click(screen.getByRole('button', { name: 'Add reaction' }));
    expect(screen.getByRole('button', { name: 'Love' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rocket' })).toBeInTheDocument();
  });

  it('returns the selected reaction and closes the picker', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(ReactionPicker, { props: { onSelect } });

    await user.click(screen.getByRole('button', { name: 'Add reaction' }));
    await user.click(screen.getByRole('button', { name: 'Celebrate' }));

    expect(onSelect).toHaveBeenCalledWith({ key: 'celebrate', emoji: '🎉', label: 'Celebrate' });
    expect(screen.queryByRole('button', { name: 'Celebrate' })).not.toBeInTheDocument();
  });
});
