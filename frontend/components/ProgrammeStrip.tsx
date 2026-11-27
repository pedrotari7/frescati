import Link from 'next/link';
import { ChevronRightIcon, NewspaperIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { isGameDay } from '@shared/matchday';
import type { Game, Season } from '@shared/types';
import { colors, tint } from '../app/tokens.stylex';
import { useUsersByUid } from '../hooks/useData';
import type { Programme } from '../hooks/useProgramme';
import { useProgramme } from '../hooks/useProgramme';
import { nameByUid } from '../lib/people';
import { focus } from '../lib/styles';
import { describeStoryline } from './programme/describeStoryline';
import { teamName } from './TeamBadge';

const styles = stylex.create({
	strip: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		marginTop: 16,
		padding: 12,
		borderRadius: 14,
		backgroundColor: tint.brand10,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.brand25,
	},
	icon: { color: colors.brand, width: 20, height: 20, flexShrink: 0 },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	title: { display: 'block', color: colors.brand, fontSize: 13, fontWeight: 700 },
	lead: {
		display: 'block',
		color: colors.ink,
		fontSize: 13,
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	},
	chevron: { color: colors.brand, width: 16, height: 16, flexShrink: 0 },
});

/** One line to tempt somebody in: the odds when there are teams, otherwise the best storyline. */
const leadOf = (programme: Programme | null, nameOf: (uid: string) => string): string | null => {
	if (programme?.odds) return programme.odds.map(({ team, percent }) => `${teamName(team)} ${percent}%`).join(' · ');

	const storyline = programme?.storylines[0];

	return storyline ? describeStoryline(storyline, nameOf(storyline.uid)) : null;
};

/**
 * The season home's way into the programme. Drawn on game day only, which is
 * the surprise: the card people open every week looks different on the day.
 */
const ProgrammeStrip = ({ game, season, now }: { game: Game; season: Season; now: Date }) => {
	const today = isGameDay(game, season, now);
	const { programme } = useProgramme(season.id, game.id, today);
	const { usersByUid } = useUsersByUid();

	if (!today) return null;

	const lead = leadOf(programme, uid => nameByUid(usersByUid, uid));

	return (
		<Link href={`/s/${season.id}/g/${game.id}/programme`} {...stylex.props(focus.ring, styles.strip)}>
			<NewspaperIcon {...stylex.props(styles.icon)} aria-hidden='true' />
			<span {...stylex.props(styles.body)}>
				<span {...stylex.props(styles.title)}>Matchday programme</span>
				{lead && <span {...stylex.props(styles.lead)}>{lead}</span>}
			</span>
			<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
		</Link>
	);
};

export default ProgrammeStrip;
