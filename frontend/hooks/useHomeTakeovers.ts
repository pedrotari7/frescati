'use client';

import { useFullTimeTakeover } from './useFullTimeTakeover';
import { useLiveGameRedirect } from './useLiveGameRedirect';
import { useSeasonRecapTakeover } from './useRecapTakeover';

/**
 * Everything that can send somebody away from the season home on arrival, in
 * the order they give way to each other: the game on now, the end of the
 * season, then last game's full-time card. Each checks the ones above it itself,
 * so the order here is for the reader.
 */
export const useHomeTakeovers = (arrival: Parameters<typeof useLiveGameRedirect>[0]) => {
	useLiveGameRedirect(arrival);
	useSeasonRecapTakeover(arrival.season, arrival.ready);
	useFullTimeTakeover(arrival);
};
