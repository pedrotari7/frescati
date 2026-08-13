import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/firebase';

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { onResponseWrite } from './onResponseWrite';
export { onGameWrite } from './onGameWrite';
export { onSeasonWrite } from './onSeasonWrite';
export { onUserCreated } from './onUserCreated';
export { rebuildTeams } from './rebuildTeams';
export { finaliseTournament, finaliseDueTournaments, onMatchWrite } from './finaliseTournament';
export { onGameDeleted, onSeasonDeleted } from './cascadeDeletes';
export { sendReminders } from './sendReminders';
export { auditGameCounts } from './auditCounts';
export { onBudgetAlert } from './onBudgetAlert';
export { setAppAdmin } from './setAppAdmin';
export { setStartingRating } from './setStartingRating';
export { sendTestPush } from './sendTestPush';
export { sendTestEmail } from './sendTestEmail';
export { throwTestError } from './throwTestError';
export { getPushDevices } from './getPushDevices';
export { getGameWatchers } from './getGameWatchers';
export { getCalendarLink, rotateCalendarToken } from './calendarLink';
export { calendarFeed } from './calendarFeed';
