'use client';

import { useCallback } from 'react';
import type { Receipt } from '@shared/types';
import { receiptFileName, receiptHref } from '@shared/receipts';
import { fetchReceipt } from '../lib/db/receipts';
import { saveBlob } from '../lib/utils/download';
import { useToast } from '../components/Toast';
import { useWrite } from './useWrite';

/**
 * The two things anybody does with a receipt: take a copy of it, or send
 * somebody else to it.
 *
 * Both live here because both screens have both. The books list every receipt
 * the season has, and a receipt also has a screen to itself so that a link to
 * one can be pasted into a group chat, and neither of those is allowed to be
 * the copy that gets a fix.
 *
 * `useWrite` is doing its usual job on two things that are not Firestore
 * writes: an authorised fetch of the file and a clipboard call, both of which
 * fail the same way a write does, in the background and with nothing on screen
 * unless somebody says so.
 */
export const useReceiptActions = (seasonId: string) => {
	const write = useWrite();
	const { notify } = useToast();

	// No pending state of its own: `Button` spins for as long as the handler it
	// was given is still running, which here is this fetch.
	const download = useCallback(
		async (receipt: Receipt) => {
			await write(async () => {
				saveBlob(await fetchReceipt(seasonId, receipt.id), receiptFileName(receipt));
			}, `Couldn't download ${receipt.name}.`);
		},
		[seasonId, write]
	);

	const copyLink = useCallback(
		async (receipt: Receipt) => {
			// Read here rather than stored, so a link copied from a phone points at
			// the app that phone is running and a link copied from a preview
			// deployment stays on that deployment.
			const url = `${window.location.origin}${receiptHref(seasonId, receipt.id)}`;

			const ok = await write(() => navigator.clipboard.writeText(url), "Couldn't copy the link.");

			if (ok) notify('Link copied. It only opens for people in this season.');
		},
		[seasonId, notify, write]
	);

	return { download, copyLink };
};
