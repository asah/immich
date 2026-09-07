import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { describe } from 'vitest';
import AlbumDescription from './AlbumDescription.svelte';

describe('AlbumDescription component', () => {
  it('shows the rich text editor when isOwned is true', () => {
    render(AlbumDescription, { isOwned: true, id: '', description: '' });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not show the rich text editor when isOwned is false', () => {
    render(AlbumDescription, { isOwned: false, id: '', description: '' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
