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
import StatusPill from '../StatusPill';
import { formatGameDateLong } from '@shared/format';
import type { FullTimeCard as Card } from '@shared/fullTime';
import { isBeforeFullTime } from '@shared/fullTime';
import { FULL_TIME_FROM } from '../../lib/fullTimeFrom';
import { teamName } from '../TeamBadge';
import { describeFinish } from './describeHighlight';
import FullTimeCard from './FullTimeCard';
import { useShareCard } from './useShareCard';

const styles = stylex.create({
	page: { padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 },
	badge: { alignSelf: 'center' },
});

/**
 * Claiming the session and marking the card seen, both skipped for a preview,
 * which must not use up the real card it is a preview of.
 *
 * Seen the moment it is on screen, however they leave: the chevron and the tabs
 * are as good a way out as Done, and a card that came back on every launch for a
 * week because nobody pressed Done would be a nag. `mark` is for Done and Share,
 * which say the same thing again.
 */
const useSeenMark = (seasonId: string, gameId: string, card: Card | null, previewing: boolean) => {
	useEffect(() => {
		if (!previewing) claimFullTimeSession(gameId);
	}, [gameId, previewing]);

	useEffect(() => {
		if (card && !previewing) markFullTimeSeen(seasonId, card.finalisedAt);
	}, [card, seasonId, previewing]);

	return () => {
		if (card && !previewing) markFullTimeSeen(seasonId, card.finalisedAt);
	};
};

/** Whose card this is: a previewing app admin's pick, otherwise always the person looking. */
const useSubject = (preview: boolean, player: string | undefined) => {
	const { user } = useAuth();
	const previewing = preview && !!user?.isAppAdmin;

	return { previewing, subject: previewing && player ? player : (user?.uid ?? null) };
};

const NoCard = ({ previewing, tooEarly }: { previewing: boolean; tooEarly: boolean }) => {
	if (tooEarly) {
		return (
			<EmptyState
				title='Full-time cards start with the next game'
				message='This one was played before they began.'
			/>
		);
	}

	return previewing ? (
		<EmptyState title='They did not play in this game' message='Pick somebody the result rated.' />
	) : (
		<EmptyState title='You did not play in this game' message='Your card is waiting after the next one.' />
	);
};

/**
 * The full-time card's screen, reached from the takeover on the season home or
 * from the game screen afterwards.
 *
 * Claims the session on the way in, whichever way that was, so closing it never
 * lands on a season home that sends them straight back.
 *
 * `preview` with `player` is the debug screen's way in: an app admin sees that
 * player's card, labelled as a preview, and nothing about it is recorded.
 * Anybody else asking for it gets their own card, the same as without it.
 */
const FullTimeScreen = ({
	seasonId,
	gameId,
	preview = false,
	player,
}: {
	seasonId: string;
	gameId: string;
	preview?: boolean;
	player?: string;
}) => {
	const router = useRouter();
	const { canGoBack } = useAppHistory();
	const { season } = useSeasonContext();
	const { previewing, subject } = useSubject(preview, player);
	const fetched = useFullTimeCard(seasonId, gameId, subject);
	const { loading, error, retry } = fetched;
	const tooEarly = !previewing && !!fetched.card && isBeforeFullTime(fetched.card.kickoff, FULL_TIME_FROM);
	const card = tooEarly ? null : fetched.card;
	const markSeen = useSeenMark(seasonId, gameId, card, previewing);
	const home = `/s/${seasonId}`;

	if (error) {
		return (
			<SeasonShell title='Full time' backHref={home}>
				<LoadFailed what='this full-time card' onRetry={retry} />
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
				<NoCard previewing={previewing} tooEarly={tooEarly} />
			</SeasonShell>
		);
	}

	const done = () => {
		markSeen();

		if (canGoBack) router.back();
		else router.push(home);
	};

	return (
		<SeasonShell title='Full time' backHref={home}>
			<div {...stylex.props(styles.page)}>
				{previewing && <StatusPill sx={styles.badge}>Preview</StatusPill>}
				<ShareableCard card={card} timezone={season?.slot.timezone ?? 'UTC'} onSeen={markSeen} onDone={done} />
			</div>
		</SeasonShell>
	);
};

/** The card with its share action, split out so the hook only runs once there is a card to share. */
const ShareableCard = ({
	card,
	timezone,
	onSeen,
	onDone,
}: {
	card: Card;
	timezone: string;
	onSeen: () => void;
	onDone: () => void;
}) => {
	const { swatches, share } = useShareCard(card, {
		team: `Team ${teamName(card.team)}`,
		finish: describeFinish(card),
		date: formatGameDateLong(card.kickoff, timezone),
		app: 'Frescati',
	});

	const onShare = () => {
		onSeen();
		void share();
	};

	return (
		<FullTimeCard card={card} timezone={timezone} onShare={onShare} onDone={onDone}>
			{swatches}
		</FullTimeCard>
	);
};

export default FullTimeScreen;
