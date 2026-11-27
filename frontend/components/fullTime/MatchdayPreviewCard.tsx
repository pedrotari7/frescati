'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NewspaperIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import { colors } from '../../app/tokens.stylex';
import { useTournamentResult } from '../../hooks/useData';
import { nameByUid } from '../../lib/people';
import { focus, panel, surfaces } from '../../lib/styles';
import { Field, Select } from '../Field';

const styles = stylex.create({
	actions: { display: 'flex', flexDirection: 'column', gap: 12 },
	button: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: 44,
		paddingInline: 18,
		borderRadius: 12,
		color: colors.ink,
		fontSize: 14,
		fontWeight: 600,
		textDecoration: 'none',
	},
	hint: { color: colors.faint, fontSize: 13 },
});

const PreviewLink = ({ href, children }: { href: string; children: string }) => (
	<Link href={href} {...stylex.props(surfaces.glassCard, focus.ring, styles.button)}>
		{children}
	</Link>
);

/**
 * Whose card to preview, out of everybody the result rated, alphabetically.
 * Kept apart so the result is only read once a game is picked.
 */
const CardPicker = ({
	seasonId,
	gameId,
	usersByUid,
}: {
	seasonId: string;
	gameId: string;
	usersByUid: Map<string, AppUser>;
}) => {
	const { result } = useTournamentResult(seasonId, gameId);
	const [picked, setPicked] = useState<string | null>(null);

	const players = (result?.changes ?? [])
		.map(change => ({ uid: change.uid, name: nameByUid(usersByUid, change.uid) }))
		.sort((a, b) => a.name.localeCompare(b.name));

	if (players.length === 0) {
		return <p {...stylex.props(styles.hint)}>No full-time cards until this game has a confirmed result.</p>;
	}

	const player = players.some(candidate => candidate.uid === picked) ? picked! : players[0].uid;

	return (
		<>
			<Field label='Whose card'>
				<Select value={player} onChange={event => setPicked(event.target.value)}>
					{players.map(candidate => (
						<option key={candidate.uid} value={candidate.uid}>
							{candidate.name}
						</option>
					))}
				</Select>
			</Field>
			<PreviewLink href={`/s/${seasonId}/g/${gameId}/full-time?preview=1&player=${player}`}>
				Preview card
			</PreviewLink>
		</>
	);
};

/**
 * The programme and the full-time cards for the game picked above, on any day,
 * for an app admin checking how they look. The programme works by its address
 * on any day anyway. A card preview shows whoever is picked, says it is a
 * preview, and marks nothing seen, so it never uses up that player's real one.
 */
const MatchdayPreviewCard = ({
	seasonId,
	gameId,
	usersByUid,
}: {
	seasonId: string | null;
	gameId: string | null;
	usersByUid: Map<string, AppUser>;
}) => (
	<section {...stylex.props(surfaces.glass, panel.card)}>
		<div {...stylex.props(panel.head)}>
			<NewspaperIcon {...stylex.props(panel.headIcon)} aria-hidden='true' />
			<h2 {...stylex.props(panel.title)}>Matchday</h2>
		</div>

		<p {...stylex.props(panel.blurb)}>
			The programme and the full-time cards for the game above, whatever the day. Previews open for you only and
			mark nothing seen.
		</p>

		{seasonId && gameId ? (
			<div {...stylex.props(styles.actions)}>
				<PreviewLink href={`/s/${seasonId}/g/${gameId}/programme`}>Preview programme</PreviewLink>
				<CardPicker seasonId={seasonId} gameId={gameId} usersByUid={usersByUid} />
			</div>
		) : (
			<p {...stylex.props(styles.hint)}>Pick a game above to preview its programme and full-time cards.</p>
		)}
	</section>
);

export default MatchdayPreviewCard;
