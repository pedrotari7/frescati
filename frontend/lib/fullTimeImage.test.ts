import type { FullTimeCard } from '@shared/fullTime';
import { readCardPalette, renderFullTimeImage, shareImage } from './fullTimeImage';

const card: FullTimeCard = {
	seasonId: 's',
	gameId: 'g',
	kickoff: '2026-11-24T18:00:00.000Z',
	finalisedAt: '2026-11-24T21:00:00.000Z',
	team: 1,
	position: 0,
	shared: false,
	teamCount: 3,
	record: { won: 3, drawn: 1, lost: 0 },
	before: 1100,
	after: 1110,
	delta: 10,
	highlights: [{ kind: 'runExtended', count: 4 }],
};

const palette = {
	background: 'rgb(7, 8, 10)',
	surface: 'rgb(15, 17, 21)',
	text: 'rgb(243, 245, 248)',
	muted: 'rgb(152, 161, 177)',
	up: 'rgb(52, 211, 153)',
	down: 'rgb(251, 113, 133)',
	accent: 'rgb(61, 220, 132)',
	team: 'rgb(167, 139, 250)',
	font: 'Inter, sans-serif',
};

const labels = { team: 'Team B', finish: '1st of 3', date: 'Tuesday 24 Nov', app: 'Frescati' };

describe('renderFullTimeImage', () => {
	const fillText = vi.fn();
	const canvases: HTMLCanvasElement[] = [];

	beforeEach(() => {
		fillText.mockClear();
		canvases.length = 0;
		const context = new Proxy({ fillText } as Record<string, unknown>, {
			get: (target, key) => target[key as string] ?? vi.fn(),
			set: (target, key, value) => {
				target[key as string] = value;
				return true;
			},
		});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
			canvases.push(this);
			return context as unknown as CanvasRenderingContext2D;
		});
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback =>
			callback(new Blob(['png'], { type: 'image/png' }))
		);
		Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
	});

	afterEach(() => vi.restoreAllMocks());

	it('draws a portrait PNG sized for a chat', async () => {
		const blob = await renderFullTimeImage(card, labels, palette);

		expect(blob.type).toBe('image/png');
		expect(canvases[0].width).toBe(1080);
		expect(canvases[0].height).toBe(1350);
	});

	it('draws the team, finish, record, rating and highlight', async () => {
		await renderFullTimeImage(card, labels, palette);
		const drawn = fillText.mock.calls.map(([text]) => text);

		expect(drawn).toEqual(
			expect.arrayContaining(['Team B', '1st of 3', 'W 3 · D 1 · L 0', '72', '+2', '4 wins in a row', 'Frescati'])
		);
	});
});

describe('shareImage', () => {
	const blob = new Blob(['png'], { type: 'image/png' });

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('hands the file to the share sheet where the phone takes files', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });

		await expect(shareImage(blob, 'full-time.png')).resolves.toBe('shared');
		expect(share.mock.calls[0][0].files[0].name).toBe('full-time.png');
	});

	it('says cancelled when the share sheet is closed', async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'));
		vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });

		await expect(shareImage(blob, 'full-time.png')).resolves.toBe('cancelled');
	});

	it('downloads it where the phone cannot share files', async () => {
		vi.stubGlobal('navigator', { ...navigator, canShare: () => false });
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		URL.createObjectURL = vi.fn(() => 'blob:card');
		URL.revokeObjectURL = vi.fn();

		await expect(shareImage(blob, 'full-time.png')).resolves.toBe('downloaded');
		expect(click).toHaveBeenCalled();
	});
});

describe('readCardPalette', () => {
	it('reads each colour off its swatch', () => {
		const root = document.createElement('div');
		root.innerHTML = '<span data-swatch="up" style="color: rgb(1, 2, 3)"></span>';
		document.body.append(root);

		expect(readCardPalette(root).up).toBe('rgb(1, 2, 3)');
		root.remove();
	});
});
