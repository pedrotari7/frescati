import * as stylex from '@stylexjs/stylex';
import type { FormLine, FormResult } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import Section from './Section';

const styles = stylex.create({
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
	row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
	name: { color: colors.ink, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
	results: { display: 'flex', gap: 4, flexShrink: 0 },
	chip: {
		width: 22,
		height: 22,
		borderRadius: 6,
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 11,
		fontWeight: 700,
	},
	W: { backgroundColor: tint.in20, color: colors.in },
	D: { backgroundColor: tint.white10, color: colors.muted },
	L: { backgroundColor: tint.white5, color: colors.faint },
	debut: { color: colors.pending, fontSize: 12, fontWeight: 600 },
});

const LABEL: Record<FormResult, string> = { W: 'won', D: 'drew', L: 'lost' };

/** Everybody's last five, oldest first, the way a printed programme lists form. */
const FormGuide = ({ form, nameOf }: { form: FormLine[]; nameOf: (uid: string) => string }) => (
	<Section title='Form'>
		<ul {...stylex.props(styles.list)}>
			{form.map(({ uid, results }) => (
				<li key={uid} aria-label={nameOf(uid)} {...stylex.props(styles.row)}>
					<span {...stylex.props(styles.name)}>{nameOf(uid)}</span>
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
			))}
		</ul>
	</Section>
);

export default FormGuide;
