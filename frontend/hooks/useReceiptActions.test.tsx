import { act, renderHook } from '@testing-library/react';
import type { Receipt } from '@shared/types';

/**
 * The two things anybody does with a receipt, and the two things that can go
 * wrong with them silently.
 *
 * Both are fire-and-forget handlers on a button: a fetch of the file and a
 * clipboard call. Neither renders anything of its own, so a failed one leaves
 * the tap looking exactly like a successful one unless somebody says otherwise,
 * which is the whole reason they go through `useWrite`. That is what is checked
 * here, along with the two things the app decides rather than the browser: what
 * the file is called on the way to disk, and that the copied link points at a
 * screen in the app rather than at the bytes.
 */

/**
 * Named with the `mock` prefix and declared as functions, because `jest.mock`
 * factories are hoisted above every `const` in this file. The jest.fn()s below
 * are only reached when the hook renders, which is long afterwards.
 */
function mockUseToast() {
	return { notify: mockNotify, warn: mockWarn };
}

jest.mock('../lib/db/receipts', () => ({ fetchReceipt: jest.fn() }));
jest.mock('../lib/utils/download', () => ({ saveBlob: jest.fn() }));
jest.mock('../components/Toast', () => ({ useToast: mockUseToast }));

import { fetchReceipt } from '../lib/db/receipts';
import { saveBlob } from '../lib/utils/download';
import { useReceiptActions } from './useReceiptActions';

const mockNotify = jest.fn();
const mockWarn = jest.fn();

const SEASON = 'season-1';

const receipt: Receipt = {
	id: 'r1',
	name: 'Pitch invoice, spring 2026',
	contentType: 'application/pdf',
	size: 318_000,
	uploadedBy: 'bo',
	uploadedAt: '2026-03-12T10:00:00.000Z',
};

const writeText = jest.fn<Promise<void>, [string]>();

beforeEach(() => {
	jest.clearAllMocks();
	writeText.mockResolvedValue(undefined);

	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

	// `useWrite` logs a failed action as well as reporting it. Worth having in
	// the app, not worth having in the test output.
	jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	jest.restoreAllMocks();
});

const actions = () => renderHook(() => useReceiptActions(SEASON)).result;

describe('downloading one', () => {
	it('saves the bytes under the name an admin typed', async () => {
		const blob = new Blob(['%PDF']);
		(fetchReceipt as jest.Mock).mockResolvedValue(blob);

		const { current } = actions();
		await act(() => current.download(receipt));

		expect(fetchReceipt).toHaveBeenCalledWith(SEASON, 'r1');
		expect(saveBlob).toHaveBeenCalledWith(blob, 'Pitch invoice, spring 2026.pdf');
	});

	// A rejected fetch is a rule saying no or a phone with no signal, and either
	// way the tap looks like nothing happened at all.
	it('says so when the file will not come down', async () => {
		(fetchReceipt as jest.Mock).mockRejectedValue(new Error('permission-denied'));

		const { current } = actions();
		await act(() => current.download(receipt));

		expect(saveBlob).not.toHaveBeenCalled();
		expect(mockWarn).toHaveBeenCalledWith("Couldn't download Pitch invoice, spring 2026.");
	});
});

describe('copying a link to one', () => {
	// The claim the whole feature rests on: what gets pasted into a group chat
	// is a screen in the app, which asks whoever opens it to sign in, and never
	// a Cloud Storage URL, which would work for anybody holding it.
	it('copies a link into the app rather than at the file', async () => {
		const { current } = actions();
		await act(() => current.copyLink(receipt));

		expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/season-1/finances/r/r1`);
		expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('Link copied'));
	});

	it('says so when the clipboard refuses', async () => {
		writeText.mockRejectedValue(new Error('not allowed'));

		const { current } = actions();
		await act(() => current.copyLink(receipt));

		expect(mockNotify).not.toHaveBeenCalled();
		expect(mockWarn).toHaveBeenCalledWith("Couldn't copy the link.");
	});
});
