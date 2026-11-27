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
import FullTimeCard from './FullTimeCard';

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
				<FullTimeCard
					card={card}
					timezone={season?.slot.timezone ?? 'UTC'}
					onShare={() => markFullTimeSeen(card.finalisedAt)}
					onDone={done}
				/>
			</div>
		</SeasonShell>
	);
};

export default FullTimeScreen;
