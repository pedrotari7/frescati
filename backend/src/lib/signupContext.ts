import type { Season } from '../../../shared/types';
import type { SignupContext } from '../../../shared/notifications';
import { formatCivilDate } from '../../../shared/format';

/** What the sign-up pushes say about a season, with the close date already written out. */
export const signupContext = (season: Pick<Season, 'id' | 'name' | 'signupClosesOn'>): SignupContext => ({
	seasonId: season.id,
	seasonName: season.name,
	closesOn: season.signupClosesOn ? formatCivilDate(season.signupClosesOn) : undefined,
});
