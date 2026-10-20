import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordButton } from '../../src/features/recorder/RecordButton';

describe('RecordButton', () => {
  afterEach(cleanup);

  it('labels the start action and is not pressed when idle', () => {
    render(<RecordButton recording={false} onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Start recording' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('labels the stop action and is pressed while recording', () => {
    render(<RecordButton recording onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: 'Stop recording' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggle on click', () => {
    const onToggle = vi.fn();
    render(<RecordButton recording={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle when disabled and shows the reason', () => {
    const onToggle = vi.fn();
    render(
      <RecordButton
        recording={false}
        onToggle={onToggle}
        disabled
        disabledReason="Download the model first."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Download the model first.')).toBeInTheDocument();
  });
});
