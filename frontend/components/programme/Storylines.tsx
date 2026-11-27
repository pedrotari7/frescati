import * as stylex from '@stylexjs/stylex';
import type { Storyline } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import type { PersonRow } from '../../lib/people';
import { animations, stagger } from '../../lib/styles';
import { describeStoryline } from './describeStoryline';
import Face from './Face';
import Section from './Section';

const styles = stylex.create({
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
	item: { display: 'flex', alignItems: 'center', gap: 12 },
	text: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
	line: { color: colors.ink, fontSize: 15 },
	tag: {
		alignSelf: 'flex-start',
		borderRadius: 999,
		paddingInline: 8,
		paddingBlock: 1,
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
	},
	tagColour: (ink: string, wash: string) => ({ color: ink, backgroundColor: wash }),
});

/** What each kind of storyline is called, and its colour. */
const KINDS: Record<Storyline['kind'], { tag: string; ink: string; wash: string }> = {
	winRun: { tag: 'On a run', ink: colors.in, wash: tint.in15 },
	lossRun: { tag: 'Due a win', ink: colors.pending, wash: tint.pending15 },
	milestone: { tag: 'Milestone', ink: colors.gold, wash: tint.gold15 },
	debut: { tag: 'Debut', ink: colors.extra, wash: tint.extra15 },
	return: { tag: 'Welcome back', ink: colors.sky, wash: tint.sky15 },
	motmRun: { tag: 'Man of the match', ink: colors.gold, wash: tint.gold15 },
};

/** The things worth knowing about tonight's players, at most one each. */
const Storylines = ({ storylines, personOf }: { storylines: Storyline[]; personOf: (uid: string) => PersonRow }) => {
	if (storylines.length === 0) return null;

	return (
		<Section title='On the line' tone={{ ink: colors.gold, wash: tint.gold15 }} order={1}>
			<ul {...stylex.props(styles.list)}>
				{storylines.map((storyline, index) => {
					const person = personOf(storyline.uid);
					const kind = KINDS[storyline.kind];

					return (
						<li key={storyline.uid} {...stylex.props(styles.item, animations.rise, stagger.at(index + 2))}>
							<Face person={person} ring={kind.ink} size='md' />
							<span {...stylex.props(styles.text)}>
								<span {...stylex.props(styles.tag, styles.tagColour(kind.ink, kind.wash))}>
									{kind.tag}
								</span>
								<span {...stylex.props(styles.line)}>
									{describeStoryline(storyline, person.displayName)}
								</span>
							</span>
						</li>
					);
				})}
			</ul>
		</Section>
	);
};

export default Storylines;
