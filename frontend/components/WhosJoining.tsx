'use client';

import * as stylex from '@stylexjs/stylex';
import type { AppUser, Signup } from '@shared/types';
import { byDisplayName } from '@shared/format';
import { displayNameOf } from '../lib/people';
import Person from './Person';
import { ListCard, ListEmpty, SectionHeading, listRow } from './Section';

const styles = stylex.create({
	heading: { marginBottom: 8, paddingInline: 4 },
	row: { display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 10 },
});

/** The people who have said yes so far, by name. A draft's page shows it under the question. */
const WhosJoining = ({ signups, usersByUid }: { signups: Signup[]; usersByUid: Map<string, AppUser> }) => {
	const joining = signups
		.filter(signup => signup.status === 'yes')
		.map(signup => ({ uid: signup.uid, person: usersByUid.get(signup.uid) }))
		.sort((a, b) => byDisplayName(a.person ?? {}, b.person ?? {}));

	return (
		<section>
			<SectionHeading sx={styles.heading}>Who&apos;s joining ({joining.length})</SectionHeading>
			<ListCard>
				{joining.length === 0 ? (
					<ListEmpty>Nobody yet.</ListEmpty>
				) : (
					joining.map(({ uid, person }) => (
						<div key={uid} {...stylex.props(listRow, styles.row)}>
							<Person person={person ?? { displayName: displayNameOf(null), photoURL: null }} />
						</div>
					))
				)}
			</ListCard>
		</section>
	);
};

export default WhosJoining;
