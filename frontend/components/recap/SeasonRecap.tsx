'use client';

import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { getAwards, getBanter, getClubRecap, getPersonalRecap } from '@shared/recap';
import { useSeasonContext } from '../SeasonProvider';
import SeasonShell from '../SeasonShell';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import LoadFailed from '../LoadFailed';
import Story from './Story';
import { buildRecapSlides } from './RecapSlides';
import { useSeasonRecap } from '../../hooks/useSeasonRecap';
import { useUser, useUsersByUid } from '../../hooks/useData';
import { useAuth } from '../../lib/auth';
import { markRecapWatched } from '../../lib/db/users';
import { nameByUid } from '../../lib/people';
import { captureError } from '../../lib/sentry';

const styles = stylex.create({
	page: { padding: 16 },
});

/**
 * The season told as a story, at `/s/{id}/recap`.
 *
 * `player` puts somebody else's season at the end, which is what their profile
 * links to. `preview` lets an app admin watch it before the season is over;
 * for anybody else it is ignored and the usual wait applies.
 *
 * Reaching the last slide is recorded only when it is your own season and not a
 * preview, because that record is what stops the recap taking over your home
 * screen, and looking at a friend's or a test run is not you having watched it.
 */
const SeasonRecap = ({ player, preview = false }: { player?: string; preview?: boolean }) => {
	const { seasonId, season, games } = useSeasonContext();
	const { user } = useAuth();
	const { user: me } = useUser(user?.uid ?? null);
	const { usersByUid } = useUsersByUid();
	const { input, ratedCount, gameCount, error, retry } = useSeasonRecap(season, games);

	const previewing = preview && !!user?.isAppAdmin;
	const subject = player ?? user?.uid ?? null;
	const mine = !!user && subject === user.uid;
	const home = `/s/${seasonId}`;

	const slides = useMemo(() => {
		if (!input || !season) return [];

		const personal = subject ? getPersonalRecap(input, subject) : null;

		return buildRecapSlides({
			season,
			club: getClubRecap(input),
			awards: getAwards(input),
			banter: getBanter(input),
			personal,
			mine,
			nameOf: uid => nameByUid(usersByUid, uid),
			preview: previewing ? { rated: ratedCount, total: gameCount } : null,
		});
	}, [input, season, subject, mine, usersByUid, previewing, ratedCount, gameCount]);

	const watched = !!me?.recapsWatched?.includes(seasonId);

	const onLast = useCallback(() => {
		if (!user || !mine || previewing || watched) return;

		markRecapWatched(user.uid, seasonId).catch(failure =>
			captureError(failure as Error, { source: 'markRecapWatched' })
		);
	}, [user, mine, previewing, watched, seasonId]);

	const shell = (content: ReactNode) => (
		<SeasonShell title='Season recap' subtitle={season?.name} backHref={home}>
			<div {...stylex.props(styles.page)}>{content}</div>
		</SeasonShell>
	);

	if (season && !season.recapReadyAt && !previewing) {
		return shell(
			<EmptyState
				icon={<SparklesIcon />}
				title='Not over yet'
				message='The recap opens once every game this season has been rated.'
			/>
		);
	}

	if (error) return shell(<LoadFailed what='the season recap' onRetry={retry} />);
	if (slides.length === 0) return shell(<Skeleton />);

	return shell(<Story slides={slides} onLast={onLast} />);
};

export default SeasonRecap;
