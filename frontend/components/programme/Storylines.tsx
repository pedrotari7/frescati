import * as stylex from '@stylexjs/stylex';
import type { Storyline } from '@shared/matchday';
import { colors } from '../../app/tokens.stylex';
import { describeStoryline } from './describeStoryline';
import Section from './Section';

const styles = stylex.create({
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
	item: { color: colors.ink, fontSize: 15 },
});

/** The things worth knowing about tonight's players, at most one each. */
const Storylines = ({ storylines, nameOf }: { storylines: Storyline[]; nameOf: (uid: string) => string }) => {
	if (storylines.length === 0) return null;

	return (
		<Section title='On the line'>
			<ul {...stylex.props(styles.list)}>
				{storylines.map(storyline => (
					<li key={storyline.uid} {...stylex.props(styles.item)}>
						{describeStoryline(storyline, nameOf(storyline.uid))}
					</li>
				))}
			</ul>
		</Section>
	);
};

export default Storylines;
