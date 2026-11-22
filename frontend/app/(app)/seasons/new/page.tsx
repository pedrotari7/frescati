'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { useSeasons } from '../../../../hooks/useData';
import PageShell from '../../../../components/PageShell';
import AppAdminOnly from '../../../../components/AppAdminOnly';
import NewSeasonForm from '../../../../components/NewSeasonForm';
import Skeleton from '../../../../components/Skeleton';

const NewSeasonPage = () => {
	const { user } = useAuth();
	const { seasons, loading } = useSeasons();
	const from = useSearchParams().get('from');

	// An app admin may copy any season or start blank. Anybody else may only
	// follow on from a season they run, which the rules check again.
	const isAppAdmin = user?.isAppAdmin === true;
	const sources = isAppAdmin ? seasons : seasons.filter(season => !!user && season.adminUids.includes(user.uid));

	if (!user || loading) {
		return (
			<PageShell title='New season' backHref='/seasons'>
				<Skeleton />
			</PageShell>
		);
	}

	if (!isAppAdmin && sources.length === 0) {
		return (
			<AppAdminOnly
				title='New season'
				message='Starting a season needs the app admin role. The admins of a season can also start the next one.'
				backHref='/seasons'
			/>
		);
	}

	return (
		<PageShell title='New season' backHref='/seasons'>
			<NewSeasonForm sources={sources} preferredId={from} blankAllowed={isAppAdmin} uid={user.uid} />
		</PageShell>
	);
};

export default NewSeasonPage;
