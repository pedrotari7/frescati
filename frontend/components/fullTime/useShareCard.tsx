'use client';

import { useEffect, useRef } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { FullTimeCard } from '@shared/fullTime';
import { colors } from '../../app/tokens.stylex';
import { useWrite } from '../../hooks/useWrite';
import { readCardPalette, renderFullTimeImage, shareImage } from '../../lib/fullTimeImage';
import type { CardLabels } from '../../lib/fullTimeImage';
import { hapticLight } from '../../lib/utils/haptics';
import { useToast } from '../Toast';
import { teamStyle } from '../TeamBadge';

const styles = stylex.create({
	// Off-screen rather than `display: none`, so each swatch still has a computed colour to read.
	holder: { position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' },
	background: { color: colors.canvas },
	surface: { color: colors.raised },
	text: { color: colors.ink },
	muted: { color: colors.muted },
	up: { color: colors.in },
	down: { color: colors.out },
	accent: { color: colors.brand },
});

/**
 * Sharing the card as an image: the swatches the image takes its colours from,
 * to be drawn inside the card, and the action that paints and shares it.
 */
export const useShareCard = (card: FullTimeCard, labels: CardLabels) => {
	const holder = useRef<HTMLSpanElement>(null);
	const write = useWrite();
	const { notify } = useToast();

	const swatches = (
		<span ref={holder} aria-hidden='true' {...stylex.props(styles.holder)}>
			{(['background', 'surface', 'text', 'muted', 'up', 'down', 'accent'] as const).map(role => (
				<span key={role} data-swatch={role} {...stylex.props(styles[role])} />
			))}
			<span data-swatch='team' {...stylex.props(teamStyle(card.team).text)} />
		</span>
	);

	// Painted as soon as the card is on screen rather than on the tap. iOS only
	// opens the share sheet inside the tap that asked for it, and waiting for
	// fonts and a canvas between the two loses the tap on the way.
	const painted = useRef<Blob | null>(null);
	const paint = () =>
		holder.current ? renderFullTimeImage(card, labels, readCardPalette(holder.current)) : Promise.resolve(null);

	useEffect(() => {
		let live = true;

		paint()
			.then(image => {
				if (live) painted.current = image;
			})
			// Painted again on the tap, which reports a failure where a person sees it.
			.catch(() => {});

		return () => {
			live = false;
		};
		// The card and its labels arrive together and the page remounts on a new one.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [card]);

	const share = async () => {
		hapticLight();

		await write(async () => {
			const image = painted.current ?? (await paint());
			if (!image) return;

			const outcome = await shareImage(image, `full-time-${card.gameId}.png`);

			// The share sheet is its own confirmation. A download lands silently,
			// so it is the one that gets a word.
			if (outcome === 'downloaded') notify('Saved your card');
		}, "Couldn't make the image.");
	};

	return { swatches, share };
};
