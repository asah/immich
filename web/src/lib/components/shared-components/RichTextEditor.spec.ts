import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import RichTextEditor from './RichTextEditor.svelte';

describe('RichTextEditor', () => {
  it('keeps typed text in input order', async () => {
    const user = userEvent.setup();
    render(RichTextEditor, { props: { value: '' } });
    const editor = screen.getByRole('textbox');
    await user.type(editor, 'description');
    expect(editor).toHaveTextContent('description');
  });

  it('preserves the selection when applying a link command', async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) });
    const execCommand = vi.mocked(document.execCommand);
    Object.defineProperty(window, 'prompt', {
      configurable: true,
      value: vi.fn().mockReturnValue('https://example.com'),
    });
    render(RichTextEditor, { props: { value: 'link me' } });
    const editor = screen.getByRole('textbox');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    await fireEvent.mouseDown(screen.getByRole('button', { name: 'Link' }));
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(execCommand).toHaveBeenCalledWith('createLink', false, 'https://example.com');
    execCommand.mockRestore();
  });

  it('keeps editor keystrokes away from global shortcuts', async () => {
    const user = userEvent.setup();
    const globalKeydown = vi.fn();
    document.addEventListener('keydown', globalKeydown);
    render(RichTextEditor, { props: { value: '' } });

    await user.type(screen.getByRole('textbox'), 'a');

    expect(globalKeydown).not.toHaveBeenCalled();
    document.removeEventListener('keydown', globalKeydown);
  });
});
