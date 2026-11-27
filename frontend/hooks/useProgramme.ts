'use client';

import { useMemo } from 'react';
import { isConfirmed } from '@shared/game';
import type { FormLine, Rivalry, Storyline, TeamOdds } from '@shared/matchday';
import { getForm, getRivalry, getStorylines, getTeamOdds } from '@shared/matchday';
import { MIN_TOURNAMENT_PLAYERS } from '@shared/tournament';
import type { PlayerRating, TournamentTeams } from '@shared/types';
import { useSeasonContext } from '../components/SeasonProvider';
import { useLedger, useResponses, useTournamentTeams, useUsersByUid } from './useData';

export interface Programme {
	/** Everybody In whose place is confirmed, the same people the team sheet is drawn from. */
	pool: string[];
	/** `null` until there are teams to have odds for. */
	odds: TeamOdds[] | null;
	form: FormLine[];
	rivalry: Rivalry | null;
	storylines: Storyline[];
}

/** The four live reads behind a programme, all closed while `on` is false. */
const useProgrammeSources = (seasonId: string, gameId: string, on: boolean) => {
	const season = on ? seasonId : null;
	const game = on ? gameId : null;
	const responses = useResponses(season, game);
	const lineup = useTournamentTeams(season, game);
	const users = useUsersByUid();
	const ledger = useLedger(on);

	return {
		responses: responses.responses,
		teams: lineup.teams,
		usersByUid: users.usersByUid,
		entries: ledger.entries,
		loading: on && [responses, lineup, users, ledger].some(read => read.loading),
		error: responses.error ?? lineup.error ?? ledger.error ?? null,
		retry: ledger.retry,
	};
};

/** Odds only once there is a lineup worth having odds for. */
const oddsFor = (teams: TournamentTeams | null, playing: number, slotMinutes: number, seed: string) =>
	teams && teams.teams.length >= 2 && playing >= MIN_TOURNAMENT_PLAYERS
		? getTeamOdds(teams, slotMinutes, seed)
		: null;

/**
 * Everything the matchday programme says about one game, live.
 *
 * Answers, the lineup and the ledger are all subscriptions, so the odds move
 * through the afternoon as people say they are in. `enabled` keeps every one of
 * them closed until somebody can actually see the programme, which matters on
 * the season home, where it is game day one day a week.
 */
export const useProgramme = (seasonId: string, gameId: string, enabled: boolean) => {
	const { season, games } = useSeasonContext();
	const game = games.find(candidate => candidate.id === gameId) ?? null;
	const on = enabled && !!season && !!game;
	const { responses, teams, usersByUid, entries, loading, error, retry } = useProgrammeSources(seasonId, gameId, on);

	const pool = useMemo(
		() =>
			responses
				.filter(response => response.status === 'in' && isConfirmed(response))
				.map(response => response.uid)
				.sort(),
		[responses]
	);

	const lineupKey = teams?.teams.map(team => team.uids.join(',')).join('|') ?? '';
	const slotMinutes = season?.slot.durationMinutes ?? 0;

	const odds = useMemo(
		() => oddsFor(teams, pool.length, slotMinutes, `${gameId}:${lineupKey}`),
		// The key stands for the lineup, so a fresh snapshot of the same teams
		// does not run a few thousand simulated evenings again.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[lineupKey, pool.length, slotMinutes, gameId]
	);

	const programme = useMemo((): Programme | null => {
		if (!on || !game) return null;

		const ratings: Record<string, PlayerRating | undefined> = Object.fromEntries(
			pool.map(uid => [uid, usersByUid.get(uid)?.rating])
		);

		return {
			pool,
			odds,
			form: getForm(entries, pool),
			rivalry: getRivalry(entries, pool, teams),
			storylines: getStorylines(entries, pool, ratings, game.kickoffMillis),
		};
	}, [on, game, pool, odds, entries, teams, usersByUid]);

	return { programme, loading, error, retry };
};
