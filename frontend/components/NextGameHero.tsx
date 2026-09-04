'use client';

import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Game, GameResponse, ResponseStatus, Season } from '@shared/types';
import { getGameLifecycle, isWatchable, tallyResponses } from '@shared/game';
import { formatGameDateLong, formatGameTime, formatRelative } from '@shared/format';
import { useKit, useResponses, useUsersByUid } from '../hooks/useData';
import ExtraSpotNote from './ExtraSpotNote';
import GameKit from './GameKit';
import HeadcountBar from './HeadcountBar';
import type { DebtLock } from './RespondControl';
import RespondControl from './RespondControl';
import StatusPill from './StatusPill';
import WatchToggle from './WatchToggle';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, focus, nudge, surfaces } from '../lib/styles';

const styles = stylex.create({
	card: { position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 20 },
	glow: {
		backgroundColor: tint.brand20,
		pointerEvents: 'none',
		position: 'absolute',
		top: -96,
		right: -80,
		width: 224,
		height: 224,
		borderRadius: 9999,
		filter: 'blur(64px)',
	},
	inner: { position: 'relative' },

	/*
	 * The gap below is wider than it looks: both neighbours paint outside their
	 * layout box, the bell's 44px circle hangs 8px below this row, and the link
	 * panel's hover surface reaches 8px above its text, so anything under 16px
	 * has the panel's corner painting over the bell.
	 */
	topRow: { marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	pills: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	relative: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	link: {
		marginInline: -8,
		marginBlock: -8,
		display: 'block',
		borderRadius: 16,
		paddingInline: 8,
		paddingBlock: 8,
		backgroundColor: {
			default: null,
			':active': tint.white5,
			[bp.hover]: { default: null, ':hover': tint.white5 },
		},
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	linkRow: { display: 'flex', alignItems: 'center', gap: 12 },
	linkBody: { minWidth: 0, flexGrow: 1, flexBasis: '0%' },

	date: { color: colors.ink, fontSize: 24, lineHeight: 1.25, fontWeight: 700 },
	time: {
		color: colors.brand,
		marginTop: 2,
		fontSize: 30,
		lineHeight: '36px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	venue: {
		color: colors.muted,
		marginTop: 8,
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 14,
		lineHeight: '20px',
	},
	pin: { width: 16, height: 16, flexShrink: 0 },
	lead: { color: colors.brand, marginTop: 8, fontSize: 12, lineHeight: '16px', fontWeight: 600 },
	chevron: { color: colors.faint, width: 20, height: 20, flexShrink: 0 },

	bar: { marginTop: 20 },
	off: { color: colors.out, marginTop: 20, fontSize: 14, lineHeight: '20px' },
	respond: { marginTop: 20 },
	closed: { color: colors.faint, marginTop: 12, textAlign: 'center', fontSize: 12, lineHeight: '16px' },
});

/**
 * The whole point of the app on one card: when the next game is, whether it's
 * on, and two buttons to answer.
 */
const NextGameHero = ({
	game,
	season,
	myResponse,
	isExtra,
	watching = false,
	debtLock,
	now,
	onRespond,
	onClear,
	onWatchChange,
}: {
	game: Game;
	season: Season;
	myResponse: GameResponse | undefined;
	isExtra: boolean;
	watching?: boolean;
	/** Set when this player owes the season money. Takes the In half, and only that. */
	debtLock?: DebtLock;
	/** Passed in rather than read here, so the whole screen agrees on the time. */
	now: Date;
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
	/**
	 * Left off when nobody is signed in, no handler, no bell, rather than a
	 * dead one. The state behind it belongs to the screen: this card and the
	 * rows below it read one listener between them.
	 */
	onWatchChange?: (next: boolean) => void;
}) => {
	const lifecycle = getGameLifecycle(game, season, now);
	const timezone = season.slot.timezone;

	// `game.counts` comes from the games list query and only moves once the
	// `onResponseWrite` trigger has caught up with a response write. This is
	// the one card every player checks right after answering, so it's worth a
	// dedicated subscription to the responses it's tallying, subscribing per
	// row on the list below it is what the denormalised counts exist to avoid.
	const { responses, loading: responsesLoading } = useResponses(season.id, game.id);
	const liveGame = responsesLoading ? game : { ...game, counts: tallyResponses(responses) };

	// The register and the profiles behind the names in it. Both are small and
	// both are already cached by the time this card is the second screen
	// somebody has opened, and `GameKit` draws nothing at all here unless
	// something required is genuinely missing, so the usual cost is a listener
	// and no pixels.
	const { kit } = useKit(season.id);
	const { usersByUid } = useUsersByUid();

	return (
		<section {...stylex.props(surfaces.glass, elevation.glass, animations.rise, styles.card)}>
			<div {...stylex.props(styles.glow)} aria-hidden='true' />

			<div {...stylex.props(styles.inner)}>
				{/* The pills wrap on a narrow phone; the bell stays pinned to the
				    top-right of the card rather than wrapping with them. */}
				<div {...stylex.props(styles.topRow)}>
					<div {...stylex.props(styles.pills)}>
						<StatusPill tone='brand'>Next game</StatusPill>
						<span {...stylex.props(styles.relative)}>{formatRelative(game.kickoff)}</span>
						{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
						{lifecycle === 'locked' && <StatusPill tone='neutral'>Locked</StatusPill>}
						{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
					</div>

					{onWatchChange && isWatchable(lifecycle) && (
						<WatchToggle watching={watching} onChange={onWatchChange} />
					)}
				</div>

				{/* The card is the one screen most people ever look at, so the way
				    through to the roster has to announce itself: the same chevron
				    the game rows use, a surface that answers a tap, and a line
				    saying what is on the other side. Negative margins cancel the
				    padding, so the panel is bigger than the text without moving it.
				    Only this block is a link, the bell and the answer buttons are
				    inside the card too, and nesting them in one would swallow them. */}
				<Link href={`/s/${season.id}/g/${game.id}`} {...stylex.props(focus.ring, nudge.row, styles.link)}>
					<div {...stylex.props(styles.linkRow)}>
						<div {...stylex.props(styles.linkBody)}>
							<h2 {...stylex.props(styles.date)}>{formatGameDateLong(game.kickoff, timezone)}</h2>
							<p {...stylex.props(styles.time)}>{formatGameTime(game.kickoff, timezone)}</p>
							<p {...stylex.props(styles.venue)}>
								<MapPinIcon {...stylex.props(styles.pin)} aria-hidden='true' />
								{game.venue.name}
							</p>
							<p {...stylex.props(styles.lead)}>
								{lifecycle === 'cancelled' ? 'Game details' : "See who's playing"}
							</p>
						</div>

						<ChevronRightIcon {...stylex.props(styles.chevron, nudge.chevron)} aria-hidden='true' />
					</div>
				</Link>

				<HeadcountBar game={liveGame} season={season} sx={styles.bar} settling={responsesLoading} />

				{/* Only ever drawn when something required is genuinely missing,
				    which is the point: this card is what most people ever look
				    at, and a green tick confirming the ball exists is not what
				    they opened the app for. Nothing to bring to a game that's off. */}
				{lifecycle !== 'cancelled' && (
					<GameKit seasonId={season.id} items={kit} responses={responses} usersByUid={usersByUid} compact />
				)}

				{lifecycle === 'cancelled' ? (
					<p {...stylex.props(styles.off)}>{game.cancelledReason || 'This game is off.'}</p>
				) : (
					<>
						<div {...stylex.props(styles.respond)}>
							<RespondControl
								response={myResponse}
								onRespond={onRespond}
								onClear={onClear}
								disabled={lifecycle !== 'open'}
								debtLock={debtLock}
							/>
						</div>

						{lifecycle === 'locked' && (
							<p {...stylex.props(styles.closed)}>
								Answers closed {season.responseDeadlineHours}h before kickoff. Ask an admin if you need
								to change yours.
							</p>
						)}

						{/* Directly under the buttons, because it is the receipt for
						    the tap that just happened, an extra's In moves nothing
						    on this card, headcount included, so this is the only
						    thing on screen that answers it. */}
						<ExtraSpotNote isExtra={isExtra} myResponse={myResponse} lifecycle={lifecycle} />
					</>
				)}
			</div>
		</section>
	);
};

export default NextGameHero;
