import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe } from 'vitest';
import AlbumDescription from './AlbumDescription.svelte';

describe('AlbumDescription component', () => {
  it('shows the description as read-only until the owner selects Edit', async () => {
    const user = userEvent.setup();
    render(AlbumDescription, { isOwned: true, id: '', description: '' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not show the rich text editor when isOwned is false', () => {
    render(AlbumDescription, { isOwned: false, id: '', description: '' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
