'use client';

import { useState } from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Season, SignupStatus } from '@shared/types';
import { formatSek } from '@shared/format';
import { signupShare } from '@shared/signup';
import { clearSignup, setSignup } from '../lib/db/signups';
import type { SeenSignup } from '../lib/db/signups';
import { personRow } from '../lib/people';
import { useWrite } from '../hooks/useWrite';
import { colors } from '../app/tokens.stylex';
import { surfaces, text } from '../lib/styles';
import AnswerSheet from './AnswerSheet';
import type { AnswerChoice } from './AnswerSheet';
import Button from './Button';
import ConfirmSeasonSheet from './ConfirmSeasonSheet';
import Person from './Person';
import { ListCard, ListEmpty, listRow, SectionHeading } from './Section';

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
	head: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	count: { color: colors.muted, fontSize: 14, lineHeight: '20px' },
	person: { display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 12 },
	heading: { marginBottom: 8, paddingInline: 4 },
	pencil: { width: 16, height: 16 },
});

const GROUPS: { title: string; status: SignupStatus | null; empty: string }[] = [
	{ title: 'Joining', status: 'yes', empty: 'Nobody has said yes yet.' },
	{ title: 'Not joining', status: 'no', empty: 'Nobody has said no.' },
	{ title: 'No answer', status: null, empty: 'Everybody has answered.' },
];

/**
 * Who is joining a season that is still signing up, and the button that turns
 * the yeses into the squad.
 *
 * Every profile is in one of three groups, because everybody signed in can
 * answer. The pencil reuses `AnswerSheet`, which speaks in/out, so the choice is
 * mapped to yes/no on the way out. Confirming waits for the viewing admin's own
 * yes: they have to end up in the squad to keep their admin rights.
 *
 * Whether the confirm sheet is open belongs to the caller. `confirmSeason`
 * flips the season out of draft, and the season's snapshot can land before the
 * callable answers. A caller that draws this only for a draft would unmount the
 * sheet halfway through its own write, so it keeps this on screen until the
 * sheet closes.
 */
const SignupAdmin = ({
	seasonId,
	season,
	users,
	signups,
	viewerUid,
	confirming,
	onConfirming,
}: {
	seasonId: string;
	season: Season;
	users: AppUser[];
	signups: SeenSignup[];
	viewerUid: string;
	confirming: boolean;
	onConfirming: (open: boolean) => void;
}) => {
	const write = useWrite();
	const [answeringFor, setAnsweringFor] = useState<string | null>(null);

	const statusByUid = new Map(signups.map(signup => [signup.uid, signup.status]));
	const usersByUid = new Map(users.map(person => [person.uid, person]));
	const yesUids = signups.filter(signup => signup.status === 'yes').map(signup => signup.uid);
	const share = signupShare(season, yesUids.length);
	const viewerSaidYes = statusByUid.get(viewerUid) === 'yes';
	// And the server has it, which is where `confirmSeason` looks. A yes tapped a
	// moment ago is drawn from the local cache before it gets there.
	const viewerIsIn = signups.some(signup => signup.uid === viewerUid && signup.status === 'yes' && !signup.pending);

	const target = answeringFor ? usersByUid.get(answeringFor) : undefined;
	const targetStatus = answeringFor ? statusByUid.get(answeringFor) : undefined;

	const pick = async (answer: AnswerChoice) => {
		if (!answeringFor) return;

		const uid = answeringFor;
		const name = personRow(usersByUid, uid).displayName;

		setAnsweringFor(null);

		await write(
			() =>
				answer === null
					? clearSignup(seasonId, uid)
					: setSignup(
							seasonId,
							uid,
							answer === 'in' ? 'yes' : 'no',
							uid === viewerUid ? undefined : viewerUid
						),
			`Couldn't record the answer for ${name}.`
		);
	};

	return (
		<div {...stylex.props(styles.wrap)}>
			<section {...stylex.props(surfaces.glass, styles.head)}>
				<h2 {...stylex.props(styles.title)}>Sign-up</h2>
				<p {...stylex.props(styles.count)}>
					{yesUids.length} joining{share > 0 && `, ${formatSek(share)} each`}
				</p>

				<Button variant='primary' fullWidth disabled={!viewerIsIn} onClick={() => onConfirming(true)}>
					Confirm season
				</Button>

				{!viewerSaidYes && (
					<p {...stylex.props(text.note)}>
						Say yes yourself first. Confirming makes the yeses the squad, and an admin who is not in it
						loses the role.
					</p>
				)}
			</section>

			{GROUPS.map(group => {
				const people = users.filter(person => (statusByUid.get(person.uid) ?? null) === group.status);

				return (
					<section key={group.title} aria-label={group.title}>
						<SectionHeading sx={styles.heading}>
							{group.title} ({people.length})
						</SectionHeading>

						<ListCard>
							{people.length === 0 && <ListEmpty>{group.empty}</ListEmpty>}

							{people.map(person => (
								<div key={person.uid} {...stylex.props(listRow, styles.person)}>
									<Person person={person} />

									<Button
										size='sm'
										variant='ghost'
										aria-label={`Answer for ${person.displayName}`}
										onClick={() => setAnsweringFor(person.uid)}
									>
										<PencilSquareIcon {...stylex.props(styles.pencil)} aria-hidden='true' />
									</Button>
								</div>
							))}
						</ListCard>
					</section>
				);
			})}

			<AnswerSheet
				displayName={target?.displayName ?? ''}
				status={targetStatus === undefined ? undefined : targetStatus === 'yes' ? 'in' : 'out'}
				open={answeringFor !== null}
				onClose={() => setAnsweringFor(null)}
				onPick={pick}
			/>

			<ConfirmSeasonSheet
				open={confirming}
				onClose={() => onConfirming(false)}
				season={season}
				yesUids={yesUids}
				usersByUid={usersByUid}
			/>
		</div>
	);
};

export default SignupAdmin;
