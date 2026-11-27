import * as stylex from '@stylexjs/stylex';
import type { FormLine, FormResult } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import type { PersonRow } from '../../lib/people';
import Avatar from '../Avatar';
import Section from './Section';

const styles = stylex.create({
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
	row: { display: 'flex', alignItems: 'center', gap: 10 },
	name: {
		color: colors.ink,
		fontSize: 14,
		flexGrow: 1,
		minWidth: 0,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	results: { display: 'flex', gap: 4, flexShrink: 0 },
	chip: {
		width: 22,
		height: 22,
		borderRadius: 6,
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 11,
		fontWeight: 800,
	},
	W: { backgroundColor: colors.in, color: colors.canvas },
	D: { backgroundColor: tint.pending25, color: colors.pending },
	L: { backgroundColor: tint.out15, color: colors.out },
	debut: { color: colors.extra, fontSize: 12, fontWeight: 700 },
});

const LABEL: Record<FormResult, string> = { W: 'won', D: 'drew', L: 'lost' };

/** Everybody's last five, oldest first, the way a printed programme lists form. */
const FormGuide = ({ form, personOf }: { form: FormLine[]; personOf: (uid: string) => PersonRow }) => (
	<Section title='Form' tone={{ ink: colors.in, wash: tint.in15 }} order={3}>
		<ul {...stylex.props(styles.list)}>
			{form.map(({ uid, results }) => {
				const person = personOf(uid);

				return (
					<li key={uid} aria-label={person.displayName} {...stylex.props(styles.row)}>
						<Avatar displayName={person.displayName} photoURL={person.photoURL} size='sm' />
						<span {...stylex.props(styles.name)}>{person.displayName}</span>
						{results.length === 0 ? (
							<span {...stylex.props(styles.debut)}>Debut</span>
						) : (
							<span {...stylex.props(styles.results)}>
								{results.map((result, index) => (
									<span
										key={index}
										aria-label={LABEL[result]}
										{...stylex.props(styles.chip, styles[result])}
									>
										{result}
									</span>
								))}
							</span>
						)}
					</li>
				);
			})}
		</ul>
	</Section>
);

export default FormGuide;
