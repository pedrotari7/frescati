import type { FullTimeCard } from '@shared/fullTime';
import { toDisplayRating } from '@shared/rating';
import { describeHighlight } from '../components/fullTime/describeHighlight';
import { movementLabel } from '../components/RatingMovement';
import { saveBlob } from './utils/download';

/**
 * The full-time card as a PNG, for the share sheet.
 *
 * Drawn on a canvas in the browser rather than rendered by a server or copied
 * out of the DOM: a server would have to read Firestore, which is the API layer
 * this app does without, and a DOM-to-image library is a dependency that trips
 * over web fonts and the CSP.
 */

const WIDTH = 1080;
const HEIGHT = 1350;

/** The colours and font the image is painted in, read off the page so they are the tokens and nothing else. */
export interface CardPalette {
	background: string;
	surface: string;
	text: string;
	muted: string;
	up: string;
	down: string;
	accent: string;
	team: string;
	font: string;
}

const ROLES = ['background', 'surface', 'text', 'muted', 'up', 'down', 'accent', 'team'] as const;

/**
 * Reads each colour off the `[data-swatch]` element of the same name under
 * `root`, which the card draws styled with the token, and the font off `root`
 * itself. A canvas cannot use a CSS variable, so this is how the tokens reach it
 * without a hex value written down twice.
 */
export const readCardPalette = (root: HTMLElement): CardPalette => {
	const colourOf = (role: string) => {
		const swatch = root.querySelector<HTMLElement>(`[data-swatch='${role}']`);

		return swatch ? getComputedStyle(swatch).color : '';
	};

	return {
		...(Object.fromEntries(ROLES.map(role => [role, colourOf(role)])) as Record<(typeof ROLES)[number], string>),
		font: getComputedStyle(root).fontFamily,
	};
};

export interface CardLabels {
	team: string;
	finish: string;
	date: string;
	app: string;
}

const centred = (context: CanvasRenderingContext2D, text: string, y: number, font: string, colour: string) => {
	context.font = font;
	context.fillStyle = colour;
	context.textAlign = 'center';
	context.fillText(text, WIDTH / 2, y);
};

const drawRating = (context: CanvasRenderingContext2D, card: FullTimeCard, palette: CardPalette) => {
	context.fillStyle = palette.surface;
	context.beginPath();
	context.roundRect(240, 700, 600, 240, 48);
	context.fill();

	centred(context, 'Rating', 760, `500 36px ${palette.font}`, palette.muted);
	centred(context, String(toDisplayRating(card.after)), 880, `800 140px ${palette.font}`, palette.text);

	const movement = movementLabel(card.delta);
	const colour = card.delta > 0 ? palette.up : card.delta < 0 ? palette.down : palette.muted;
	centred(context, movement, 1000, `700 56px ${palette.font}`, colour);
};

/** Paints the card at 1080 by 1350, portrait, the shape a chat shows best. */
export const renderFullTimeImage = async (
	card: FullTimeCard,
	labels: CardLabels,
	palette: CardPalette
): Promise<Blob> => {
	await document.fonts.ready;

	const canvas = document.createElement('canvas');
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('This browser cannot draw the card');

	context.fillStyle = palette.background;
	context.fillRect(0, 0, WIDTH, HEIGHT);

	centred(context, 'FULL TIME', 150, `700 40px ${palette.font}`, palette.accent);
	centred(context, labels.date, 215, `500 40px ${palette.font}`, palette.muted);
	centred(context, labels.team, 380, `800 110px ${palette.font}`, palette.team);
	centred(context, labels.finish, 480, `600 60px ${palette.font}`, palette.text);
	centred(
		context,
		`W ${card.record.won} · D ${card.record.drawn} · L ${card.record.lost}`,
		570,
		`500 48px ${palette.font}`,
		palette.muted
	);

	drawRating(context, card, palette);

	card.highlights.forEach((highlight, index) =>
		centred(context, describeHighlight(highlight), 1110 + index * 70, `600 48px ${palette.font}`, palette.text)
	);

	centred(context, labels.app, 1290, `700 36px ${palette.font}`, palette.accent);

	return new Promise((resolve, reject) =>
		canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The card could not be drawn'))), 'image/png')
	);
};

export type ImageShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * The share sheet where the phone takes files, a download everywhere else. A
 * closed share sheet is the person changing their mind, not an error.
 */
export const shareImage = async (blob: Blob, fileName: string): Promise<ImageShareOutcome> => {
	const file = new File([blob], fileName, { type: blob.type });

	if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
		try {
			await navigator.share({ files: [file] });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
			throw error;
		}
	}

	saveBlob(blob, fileName);
	return 'downloaded';
};
