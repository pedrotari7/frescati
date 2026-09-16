import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';

const styles = stylex.create({
	stat: { borderRadius: 16, padding: 12, textAlign: 'center' },
	value: {
		color: colors.ink,
		fontSize: 24,
		lineHeight: '32px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	label: { marginTop: 2 },
	hint: { color: colors.faint, marginTop: 4, fontSize: 11 },
	caption: {
		color: colors.faint,
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},
});

/**
 * One number on a glass tile, with a word under it saying what it counts.
 *
 * A player's profile and the head-to-head screen between two players both
 * declared this, identically, down to the five styles above. They are the two
 * screens that report a career rather than a game, so they are the two that
 * need it, and the head-to-head page is reached from the profile, which makes a
 * drift between them something you would see in one tap.
 *
 * `hint` is the small line under the label, for the qualifier a number needs
 * and cannot carry: how many games a percentage is out of, how much of a career
 * the ledger actually covers.
 */
const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
	<div {...stylex.props(surfaces.glass, styles.stat)}>
		<p {...stylex.props(styles.value)}>{value}</p>
		<p {...stylex.props(styles.caption, styles.label)}>{label}</p>
		{hint && <p {...stylex.props(styles.hint)}>{hint}</p>}
	</div>
);

export default Stat;
