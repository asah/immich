import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { getVisualViewportMock } from '$lib/__mocks__/visual-viewport.mock';
import Combobox from './Combobox.svelte';

describe('Combobox', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    vi.stubGlobal('visualViewport', getVisualViewportMock());
    Element.prototype.animate = getAnimateMock();
  });

  test('waits for input before showing autocomplete options', async () => {
    render(Combobox, {
      label: 'Tag',
      options: [
        { label: 'Beach', value: 'beach' },
        { label: 'Birthday', value: 'birthday' },
      ],
    });

    const input = screen.getByRole('combobox', { name: 'Tag' });
    await fireEvent.focus(input);

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    await fireEvent.input(input, { target: { value: 'bea' } });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Beach' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Birthday' })).not.toBeInTheDocument();
  });
});
