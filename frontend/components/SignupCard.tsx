'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Season, Signup, SignupStatus } from '@shared/types';
import { formatCivilDate, formatSek, weekdayName } from '@shared/format';
import { signupShare } from '@shared/signup';
import { setSignup } from '../lib/db/signups';
import { useWrite } from '../hooks/useWrite';
import { colors } from '../app/tokens.stylex';
import { animations, elevation, surfaces, text } from '../lib/styles';
import Button from './Button';
import StatusPill from './StatusPill';

const styles = stylex.create({
	card: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 24, padding: 20 },
	head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	facts: { display: 'flex', flexDirection: 'column', gap: 2, color: colors.muted, fontSize: 14, lineHeight: '20px' },
	actions: { display: 'flex', gap: 12 },
	grow: { flexGrow: 1, flexBasis: '0%' },
	line: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 },
	lineText: { color: colors.ink, fontSize: 14, lineHeight: '20px', minWidth: 0 },
	lineName: { color: colors.muted },
});

/**
 * The question a season that is signing up puts to everybody: are you joining?
 *
 * Unanswered it is the whole card, so the answer can be given without leaving
 * the screen. Answered it folds to one line, with Change to open the two
 * buttons again. A missing answer is a real third state, so nothing here ever
 * writes a placeholder.
 *
 * `yesCount` is passed in rather than counted here, because the screen already
 * holds the signups for its list of who is joining.
 */
const SignupCard = ({
	season,
	signup,
	yesCount,
	uid,
}: {
	season: Season;
	signup: Signup | undefined;
	yesCount: number;
	uid: string;
}) => {
	const write = useWrite();
	const [changing, setChanging] = useState(false);

	const share = signupShare(season, yesCount);

	const answer = async (status: SignupStatus) => {
		const saved = await write(() => setSignup(season.id, uid, status), "Couldn't save your answer.");

		if (saved) setChanging(false);
	};

	if (signup && !changing) {
		return (
			<section {...stylex.props(surfaces.glass, elevation.glass, styles.line)}>
				<p {...stylex.props(styles.lineText)}>
					{signup.status === 'yes' ? "You're in" : 'You said not this time'}
					<span {...stylex.props(styles.lineName)}> · {season.name}</span>
				</p>
				<Button variant='ghost' size='sm' onClick={() => setChanging(true)}>
					Change
				</Button>
			</section>
		);
	}

	return (
		<section {...stylex.props(surfaces.glass, elevation.glass, animations.rise, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<h2 {...stylex.props(styles.title)}>{season.name}</h2>
				<StatusPill tone='brand'>Signing up</StatusPill>
			</div>

			<div {...stylex.props(styles.facts)}>
				<p>
					{weekdayName(season.slot.weekday)}s at {season.slot.time}, {season.venue.name}
				</p>
				<p>
					{formatCivilDate(season.startDate)} to {formatCivilDate(season.endDate)}
				</p>
				{share > 0 && <p>About {formatSek(share)} each so far</p>}
			</div>

			<p {...stylex.props(text.note)}>Are you joining? The squad is whoever says yes.</p>

			<div {...stylex.props(styles.actions)}>
				<Button variant='primary' size='lg' sx={styles.grow} onClick={() => answer('yes')}>
					Join
				</Button>
				<Button size='lg' sx={styles.grow} onClick={() => answer('no')}>
					Not this time
				</Button>
			</div>
		</section>
	);
};

export default SignupCard;
