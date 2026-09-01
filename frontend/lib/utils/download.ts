/**
 * Hand a file the browser is already holding to whoever asked for it.
 *
 * The app never navigates to a URL to download a receipt, because there is no
 * URL to navigate to: the bytes arrive over an authorised fetch and live in a
 * `Blob`, so the only way out to the filesystem is an anchor with `download` on
 * it pointed at an object URL. See `lib/db/receipts.ts` for why a download URL
 * is deliberately never minted.
 *
 * On a phone this is what puts a PDF into Files or the share sheet, which is
 * where somebody forwarding it to their payroll department needs it to be.
 */
export const saveBlob = (blob: Blob, fileName: string): void => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = fileName;
	link.rel = 'noopener';

	// In the document rather than clicked detached: Firefox ignores a click on
	// an anchor that was never in the tree.
	document.body.append(link);
	link.click();
	link.remove();

	// Not straight away. Revoking in the same task has cancelled the download in
	// Safari before it has read the blob, and there is nothing to see when it
	// does: the tap simply does nothing. A second is long past the handoff and
	// still lets go of the memory.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
