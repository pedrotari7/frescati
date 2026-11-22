'use client';

import * as stylex from '@stylexjs/stylex';
import type { Season } from '@shared/types';
import { useAuth } from '../lib/auth';
import { useDraftSeasons, useSignups } from '../hooks/useData';
import SignupCard from './SignupCard';

const styles = stylex.create({
	stack: { display: 'flex', flexDirection: 'column', gap: 12 },
});

/** One draft's card, with its own listener on who has answered, so the share is live. */
const Question = ({ season, uid }: { season: Season; uid: string }) => {
	const { signups } = useSignups(season.id);

	return (
		<SignupCard
			season={season}
			signup={signups.find(signup => signup.uid === uid)}
			yesCount={signups.filter(signup => signup.status === 'yes').length}
			uid={uid}
		/>
	);
};

/**
 * Every season still signing up, as a card, newest first. `skip` is the draft
 * whose own page is open, which draws its card itself and must not be asked twice.
 */
const SignupQuestions = ({ skip }: { skip?: string }) => {
	const { user } = useAuth();
	const drafts = useDraftSeasons();
	const open = drafts.filter(draft => draft.id !== skip);

	if (!user || open.length === 0) return null;

	return (
		<div {...stylex.props(styles.stack)}>
			{open.map(draft => (
				<Question key={draft.id} season={draft} uid={user.uid} />
			))}
		</div>
	);
};

export default SignupQuestions;
