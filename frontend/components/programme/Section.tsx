import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { animations, stagger, surfaces } from '../../lib/styles';

const styles = stylex.create({
	section: { borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
	heading: {
		fontSize: 12,
		fontWeight: 700,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
		margin: 0,
	},
	wash: (wash: string) => ({ backgroundImage: `linear-gradient(160deg, ${wash}, transparent 60%)` }),
	ink: (ink: string) => ({ color: ink }),
});

/** A section's colour: the heading in full, and a wash of it from the top corner. */
interface Tone {
	ink: string;
	wash: string;
}

/**
 * One block of the programme: a small capitals heading over whatever it has to
 * say, each block in a colour of its own so the page reads as four things
 * rather than one long list.
 */
const Section = ({
	title,
	tone,
	order,
	children,
}: {
	title: string;
	tone: Tone;
	order: number;
	children: ReactNode;
}) => (
	<section
		{...stylex.props(surfaces.glass, animations.rise, stagger.at(order), styles.section, styles.wash(tone.wash))}
		aria-label={title}
	>
		<h2 {...stylex.props(styles.heading, styles.ink(tone.ink))}>{title}</h2>
		{children}
	</section>
);

export default Section;
