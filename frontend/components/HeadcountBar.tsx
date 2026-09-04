'use client';

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import { getAwaitingSpotCount, getFormat, getHeadcountState, getMinPlayers, getNoResponseCount } from '@shared/game';
import { colors, tint } from '../app/tokens.stylex';
import { animations } from '../lib/styles';
import StatusPill from './StatusPill';

const styles = stylex.create({
	head: { marginBottom: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
	count: { display: 'flex', alignItems: 'baseline', gap: 6 },
	number: { fontSize: 24, lineHeight: '32px', fontWeight: 700 },
	ok: { color: colors.in },
	short: { color: colors.pending },
	unit: { color: colors.faint, fontSize: 14, lineHeight: '20px' },

	track: { position: 'relative', height: 6, overflow: 'hidden', borderRadius: 9999, backgroundColor: tint.white8 },
	/* Rides over the fill rather than under it, so the light crosses the green
	   and not the empty part of the track. The track clips it at both ends. */
	glint: {
		pointerEvents: 'none',
		position: 'absolute',
		inset: 0,
		backgroundImage: `linear-gradient(90deg, transparent, ${tint.white45}, transparent)`,
	},
	fillBase: {
		height: '100%',
		borderRadius: 9999,
		transitionProperty: 'all',
		transitionDuration: '0.5s',
		transitionTimingFunction: 'ease-out',
	},
	fillOk: { backgroundColor: colors.in },
	fillShort: { backgroundColor: colors.pending },

	strip: {
		color: colors.faint,
		marginTop: 8,
		display: 'flex',
		flexWrap: 'wrap',
		columnGap: 12,
		rowGap: 4,
		fontSize: 12,
		lineHeight: '16px',
	},
	awaiting: { color: colors.pending },
});

/*
 * The one genuinely per-render value on the screen, so the one dynamic style in
 * this file. It was a bare `style={{ width }}`, which cannot stay: `stylex.props`
 * returns a `style` of its own for exactly this kind of value, and a second one
 * spread beside it would silently win or lose depending on the order.
 */
const fill = stylex.create({
	width: (percent: number) => ({ width: `${percent}%` }),
});

/**
 * Progress towards the season minimum. There is no cap. The bar fills to the
 * minimum and then simply reads "ready", because more players is never a
 * problem, only fewer is.
 */
const HeadcountBar = ({
	game,
	season,
	sx,
	settling = false,
}: {
	game: Game;
	season: Season;
	sx?: StyleXStyles;
	/**
	 * That these counts are still the placeholder rather than the answer, so a
	 * change out of them is the screen loading and not the game filling up.
	 *
	 * `NextGameHero` is the caller that needs this and the reason it exists. It
	 * draws the denormalised `game.counts` until its own responses listener
	 * lands, then swaps to its tally of them, and that swap is a change in these
	 * numbers that nobody did. Left unsaid, a game whose trigger was a moment
	 * behind would throw the celebration below at somebody who had just opened
	 * the app. Callers holding one set of counts all the way through, which is
	 * the game screen, leave it alone.
	 */
	settling?: boolean;
}) => {
	const minimum = getMinPlayers(game, season);
	const { playing } = game.counts;
	const atRisk = getHeadcountState(game, season) === 'at-risk';
	const format = getFormat(playing);
	const awaiting = getNoResponseCount(game.counts, season.memberUids.length);
	const awaitingSpot = getAwaitingSpotCount(game.counts);

	const progress = minimum > 0 ? Math.min(100, (playing / minimum) * 100) : 100;

	/**
	 * Whether the game has *just* reached its minimum, which is the one moment
	 * on this card worth interrupting somebody for.
	 *
	 * Every listener in the app is live, so you can be looking at it when it
	 * happens: the count is one short, somebody else taps In, and the game goes
	 * on under your thumb. That is the payoff the whole app is for, and it used
	 * to be a colour change nobody was watching.
	 *
	 * `seen` is null until the first reading that is not settling, and that
	 * first reading is the baseline rather than a change. So arriving at a game
	 * that is already on is silent, which is the point: this says "that just
	 * happened", and it is worth nothing if it also says it about history.
	 *
	 * The count has to have *grown*. Dropping the minimum clears the shortfall
	 * too, and an admin editing the season is not eleven people turning up.
	 */
	const [reached, setReached] = useState(false);
	const seen = useRef<{ atRisk: boolean; playing: number } | null>(null);

	useEffect(() => {
		if (settling) return;

		const before = seen.current;
		seen.current = { atRisk, playing };

		if (before && before.atRisk && !atRisk && playing > before.playing) setReached(true);
	}, [settling, atRisk, playing]);

	return (
		<div {...stylex.props(sx)}>
			<div {...stylex.props(styles.head)}>
				<div {...stylex.props(styles.count)}>
					{/* The number an end-to-end test watches for the response
					    trigger's answer coming back down the listener. It is a
					    bare numeral with no accessible name of its own, and
					    matching on its text alone would find the scoreline and
					    the squad count too. */}
					<span
						data-testid='headcount-playing'
						{...stylex.props(styles.number, atRisk ? styles.short : styles.ok, reached && animations.swell)}
					>
						{playing}
					</span>
					<span {...stylex.props(styles.unit)}>{atRisk ? `of ${minimum} needed` : 'playing'}</span>
				</div>

				{/* This pill is not the "Need n more" one restyled, it replaces it, so
				    on the crossing it is a genuinely new thing arriving and pops in
				    as one. Every other time it is simply what the card says, and
				    popping it then would be motion for its own sake. */}
				{format && !atRisk && (
					<StatusPill tone='brand' sx={reached ? animations.pop : undefined}>
						{format}
					</StatusPill>
				)}
				{atRisk && <StatusPill tone='pending'>Need {minimum - playing} more</StatusPill>}
			</div>

			<div {...stylex.props(styles.track)}>
				<div
					{...stylex.props(styles.fillBase, atRisk ? styles.fillShort : styles.fillOk, fill.width(progress))}
				/>

				{/* Mounted only for the length of the run and taken down by its own
				    `animationend`, so there is no timer to get out of step with
				    however long the browser took. The reduced-motion blanket in
				    `globals.css` cuts it to 0.01ms, which still ends and still
				    fires, so it unmounts there too rather than sitting on the bar
				    as a white band. */}
				{reached && (
					<span
						{...stylex.props(styles.glint, animations.sweep)}
						onAnimationEnd={() => setReached(false)}
						aria-hidden='true'
					/>
				)}
			</div>

			<div {...stylex.props(styles.strip)}>
				<span>{game.counts.membersIn} squad</span>
				{game.counts.extrasConfirmed > 0 && <span>{game.counts.extrasConfirmed} extra</span>}
				{/* The one item on this strip that is a request rather than a
				    report, and coloured for it: these are the people the number
				    above deliberately did not move for, and an admin is the only
				    one who can. Without it, an extra tapping In changes nothing
				    anybody can see. */}
				{awaitingSpot > 0 && <span {...stylex.props(styles.awaiting)}>{awaitingSpot} awaiting a spot</span>}
				{game.counts.membersOut > 0 && <span>{game.counts.membersOut} out</span>}
				{awaiting > 0 && <span>{awaiting} yet to answer</span>}
			</div>
		</div>
	);
};

export default HeadcountBar;
