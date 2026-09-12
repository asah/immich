import { ReactionType } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ActivityStatus from './ActivityStatus.svelte';

vi.mock('$lib/managers/activity-manager.svelte', () => ({
  activityManager: {
    activities: [
      { type: ReactionType.Like, parentActivityId: null, reactionKey: 'love' },
      { type: ReactionType.Like, parentActivityId: null, reactionKey: 'love' },
    ],
  },
}));

describe('ActivityStatus', () => {
  it('calls the reaction handler when a reaction count is clicked', async () => {
    const user = userEvent.setup();
    const onReaction = vi.fn();
    render(ActivityStatus, {
      props: {
        isLiked: null,
        numberOfComments: 0,
        numberOfLikes: 2,
        disabled: false,
        onFavorite: vi.fn(),
        onReaction,
        allowAddingReactions: false,
        filterMode: true,
      },
    });

    await user.click(screen.getByRole('button', { name: '🥰 2 reactions' }));

    expect(onReaction).toHaveBeenCalledWith('love');
    expect(screen.queryByRole('button', { name: 'Like' })).not.toBeInTheDocument();
  });
});
