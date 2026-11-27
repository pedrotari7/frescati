import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../app/tokens.stylex';
import { animations, surfaces } from '../../lib/styles';

const styles = stylex.create({
	section: { borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
	heading: {
		color: colors.muted,
		fontSize: 12,
		fontWeight: 600,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
		margin: 0,
	},
});

/** One block of the programme: a small capitals heading over whatever it has to say. */
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
	<section {...stylex.props(surfaces.glass, animations.rise, styles.section)} aria-label={title}>
		<h2 {...stylex.props(styles.heading)}>{title}</h2>
		{children}
	</section>
);

export default Section;
