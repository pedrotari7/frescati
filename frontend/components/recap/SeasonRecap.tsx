'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { getAwards, getBanter, getClubRecap, getPersonalRecap } from '@shared/recap';
import type { RecapInput } from '@shared/recap';
import type { Season } from '@shared/types';
import { useSeasonContext } from '../SeasonProvider';
import SeasonShell from '../SeasonShell';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import LoadFailed from '../LoadFailed';
import Story from './Story';
import { buildRecapSlides } from './RecapSlides';
import type { SlideContext } from './RecapSlides';
import { useSeasonRecap } from '../../hooks/useSeasonRecap';
import { claimRecapSession } from '../../hooks/useRecapTakeover';
import { useUser, useUsersByUid } from '../../hooks/useData';
import { useAuth } from '../../lib/auth';
import { markRecapWatched } from '../../lib/db/users';
import { nameByUid } from '../../lib/people';
import { captureError } from '../../lib/sentry';

const styles = stylex.create({
	page: { padding: 16 },
});

/**
 * Everything the screen can show instead of the story, most serious first: the
 * season unreadable, the season gone, the season not over, the recap's own
 * reads failing, and otherwise still loading. Every one sits inside the same
 * shell, so the chevron is there on all of them.
 */
const Waiting = ({
	seasonError,
	retrySeason,
	gone,
	notOver,
	error,
	retry,
}: {
	seasonError: Error | null;
	retrySeason: () => void;
	gone: boolean;
	notOver: boolean;
	error: Error | null;
	retry: () => void;
}) => {
	if (seasonError) return <LoadFailed what='this season' onRetry={retrySeason} />;

	if (gone) {
		return (
			<EmptyState
				icon={<SparklesIcon />}
				title='This season is gone'
				message='It may have been deleted. The seasons list has the ones still here.'
			/>
		);
	}

	if (notOver) {
		return (
			<EmptyState
				icon={<SparklesIcon />}
				title='Not over yet'
				message='The recap opens once every game this season has been rated.'
			/>
		);
	}

	return error ? <LoadFailed what='the season recap' onRetry={retry} /> : <Skeleton />;
};

/** The slides for one viewer, or none until the recap has loaded. */
const useRecapSlides = (
	input: RecapInput | null,
	season: Season | null,
	subject: string | null,
	mine: boolean,
	preview: SlideContext['preview']
) => {
	const { usersByUid } = useUsersByUid();

	return useMemo(() => {
		if (!input || !season) return [];

		return buildRecapSlides({
			season,
			club: getClubRecap(input),
			awards: getAwards(input),
			banter: getBanter(input),
			personal: subject ? getPersonalRecap(input, subject) : null,
			mine,
			nameOf: uid => nameByUid(usersByUid, uid),
			preview,
		});
		// `preview` is a fresh object each render; its two numbers are what matter.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [input, season, subject, mine, usersByUid, preview?.rated, preview?.total]);
};

/**
 * What reaching the last slide does: records that this person has watched it,
 * once, when `counts` says it is their own season and not a preview. Also tells
 * the season home it has been shown this session, however it was reached.
 */
const useWatchedRecap = (seasonId: string, counts: boolean) => {
	const { user } = useAuth();
	const { user: me } = useUser(user?.uid ?? null);
	const watched = !!me?.recapsWatched?.includes(seasonId);

	useEffect(() => {
		claimRecapSession(seasonId);
	}, [seasonId]);

	return useCallback(() => {
		if (!user || !counts || watched) return;

		markRecapWatched(user.uid, seasonId).catch(failure =>
			captureError(failure as Error, { source: 'markRecapWatched' })
		);
	}, [user, counts, watched, seasonId]);
};

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
	const { seasonId, season, games, loading, error: seasonError, retry: retrySeason } = useSeasonContext();
	const { user } = useAuth();
	const { input, ratedCount, gameCount, error, retry } = useSeasonRecap(season, games, loading);

	const previewing = preview && !!user?.isAppAdmin;
	const subject = player ?? user?.uid ?? null;
	const mine = !!user && subject === user.uid;

	const slides = useRecapSlides(
		input,
		season,
		subject,
		mine,
		previewing ? { rated: ratedCount, total: gameCount } : null
	);

	const onLast = useWatchedRecap(seasonId, mine && !previewing);

	const notOver = !!season && !season.recapReadyAt && !previewing;
	const waiting = (
		<Waiting
			seasonError={seasonError}
			retrySeason={retrySeason}
			gone={!loading && !season}
			notOver={notOver}
			error={error}
			retry={retry}
		/>
	);

	return (
		<SeasonShell title='Season recap' subtitle={season?.name} backHref={`/s/${seasonId}`}>
			<div {...stylex.props(styles.page)}>
				{slides.length > 0 && !seasonError && !notOver ? <Story slides={slides} onLast={onLast} /> : waiting}
			</div>
		</SeasonShell>
	);
};

export default SeasonRecap;
