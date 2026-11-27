'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { useFullTimeCard } from '../../hooks/useFullTimeCard';
import { useAuth } from '../../lib/auth';
import { claimFullTimeSession, markFullTimeSeen } from '../../lib/fullTimeSeen';
import { useAppHistory } from '../AppHistory';
import EmptyState from '../EmptyState';
import LoadFailed from '../LoadFailed';
import { useSeasonContext } from '../SeasonProvider';
import SeasonShell from '../SeasonShell';
import Skeleton from '../Skeleton';
import { formatGameDateLong } from '@shared/format';
import type { FullTimeCard as Card } from '@shared/fullTime';
import { teamName } from '../TeamBadge';
import { describeFinish } from './describeHighlight';
import FullTimeCard from './FullTimeCard';
import { useShareCard } from './useShareCard';

const styles = stylex.create({
	page: { padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
});

/**
 * The full-time card's screen, reached from the takeover on the season home or
 * from the game screen afterwards.
 *
 * Claims the session on the way in, whichever way that was, so closing it never
 * lands on a season home that sends them straight back.
 */
const FullTimeScreen = ({ seasonId, gameId }: { seasonId: string; gameId: string }) => {
	const router = useRouter();
	const { user } = useAuth();
	const { canGoBack } = useAppHistory();
	const { season } = useSeasonContext();
	const { card, loading, error, retry } = useFullTimeCard(seasonId, gameId, user?.uid ?? null);
	const home = `/s/${seasonId}`;

	useEffect(() => {
		claimFullTimeSession(gameId);
	}, [gameId]);

	if (error) {
		return (
			<SeasonShell title='Full time' backHref={home}>
				<LoadFailed what='your full-time card' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (loading) {
		return (
			<SeasonShell title='Full time' backHref={home}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!card) {
		return (
			<SeasonShell title='Full time' backHref={home}>
				<EmptyState title='You did not play in this game' message='Your card is waiting after the next one.' />
			</SeasonShell>
		);
	}

	const done = () => {
		markFullTimeSeen(card.finalisedAt);

		if (canGoBack) router.back();
		else router.push(home);
	};

	return (
		<SeasonShell title='Full time' backHref={home}>
			<div {...stylex.props(styles.page)}>
				<ShareableCard card={card} timezone={season?.slot.timezone ?? 'UTC'} onDone={done} />
			</div>
		</SeasonShell>
	);
};

/** The card with its share action, split out so the hook only runs once there is a card to share. */
const ShareableCard = ({ card, timezone, onDone }: { card: Card; timezone: string; onDone: () => void }) => {
	const { swatches, share } = useShareCard(card, {
		team: `Team ${teamName(card.team)}`,
		finish: describeFinish(card),
		date: formatGameDateLong(card.kickoff, timezone),
		app: 'Frescati',
	});

	const onShare = () => {
		markFullTimeSeen(card.finalisedAt);
		void share();
	};

	return (
		<FullTimeCard card={card} timezone={timezone} onShare={onShare} onDone={onDone}>
			{swatches}
		</FullTimeCard>
	);
};

export default FullTimeScreen;
