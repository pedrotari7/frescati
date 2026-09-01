/**
 * The season's receipts: the paperwork a player hands their employer.
 *
 * A Swedish employer pays a friskvardsbidrag against a receipt naming what the
 * money went on, and a football season is exactly what it is for. The receipt
 * is one document the admin who paid the invoice has, and every member needs
 * their own copy of it, which until now meant a photo of a PDF in a group chat
 * that nobody can find again in March.
 *
 * The file itself lives in Cloud Storage, at a path derived from the two ids
 * and nothing else. What is stored in Firestore beside it is a name to show, a
 * size and a type to describe it with, and who put it there. The document is
 * the index and the object is the bytes, so a list of receipts is a Firestore
 * subscription like every other list in the app, and reading one is a single
 * authorised fetch.
 *
 * Everything here is pure so that both halves agree: the client picks the
 * object path it uploads to and the name a download lands with, and
 * `storage.rules` enforces the same size and the same three types from the far
 * side, where a client cannot argue with it.
 */

/**
 * What a receipt is allowed to be.
 *
 * A PDF because that is what an invoice arrives as, and the two photo formats
 * because the other half of the time it is a paper receipt under a phone
 * camera. Nothing else: a receipt goes to somebody's payroll department, and
 * the app has no business storing a file that will not open when it gets there.
 *
 * `suffixes` is what a name may already end with rather than what a download
 * gets, so a file called `kvitto.jpeg` keeps its own spelling instead of
 * landing as `kvitto.jpeg.jpg`.
 */
const RECEIPT_KINDS = [
	{ contentType: 'application/pdf', extension: 'pdf', suffixes: ['pdf'], label: 'PDF' },
	{ contentType: 'image/jpeg', extension: 'jpg', suffixes: ['jpg', 'jpeg'], label: 'JPEG' },
	{ contentType: 'image/png', extension: 'png', suffixes: ['png'], label: 'PNG' },
] as const;

/** For a file input's `accept`, which takes content types as a comma list. */
export const RECEIPT_CONTENT_TYPES = RECEIPT_KINDS.map(kind => kind.contentType);

/**
 * The ceiling on one receipt, in bytes rather than in mebibytes, so the figure
 * the copy prints is the figure the rule enforces. `storage.rules` carries the
 * same number; changing one means changing both.
 */
export const RECEIPT_MAX_BYTES = 10_000_000;

/** As long as an expense description, and for the same reason: it is a label. */
export const RECEIPT_NAME_MAX = 100;

const kindOf = (contentType: string) => RECEIPT_KINDS.find(kind => kind.contentType === contentType);

/**
 * Where the bytes live.
 *
 * Derived from the two ids and carrying no extension, because the type is a
 * field on the document beside it and a path that spells the type is a path
 * that can disagree with it. The Firestore id is minted first and the object is
 * named after it, so there is exactly one object per receipt and no way to
 * write over another one.
 */
export const receiptObjectPath = (seasonId: string, receiptId: string): string =>
	`seasons/${seasonId}/receipts/${receiptId}`;

/**
 * The screen one receipt has to itself, which is what an admin copies and puts
 * in the group chat.
 *
 * A link into the app rather than a link at the file, deliberately. Cloud
 * Storage will hand out a URL with a token in it that downloads the object for
 * anybody at all, and that is exactly the thing this feature must not do: a
 * receipt is the squad's paperwork. This link takes whoever opens it through
 * the same sign-in and the same rules as any other screen, so the people it
 * works for are the people it was already for.
 */
export const receiptHref = (seasonId: string, receiptId: string): string => `/s/${seasonId}/finances/r/${receiptId}`;

/** What a download of this receipt should be called on the way to disk. */
export const receiptFileName = (receipt: { name: string; contentType: string }): string => {
	const kind = kindOf(receipt.contentType);

	// Anything a filesystem or a download header would argue with. Swedish
	// letters are left alone: the people reading this file name are the ones
	// who typed it.
	const base =
		receipt.name
			.replace(/[\\/:*?"<>|]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, RECEIPT_NAME_MAX) || 'receipt';

	if (!kind) return base;

	const alreadySpelled = kind.suffixes.some(suffix => base.toLowerCase().endsWith(`.${suffix}`));

	return alreadySpelled ? base : `${base}.${kind.extension}`;
};

/** "PDF", "JPEG". What a row says the file is, beside how big it is. */
export const receiptKindLabel = (contentType: string): string => kindOf(contentType)?.label ?? 'File';

/**
 * A name to put in the form when a file is picked, which is almost always the
 * one the admin wants. The extension goes because it is shown separately, and
 * the separators go because `invoice_spring_2026.pdf` is a filename rather than
 * a label.
 */
export const defaultReceiptName = (fileName: string): string =>
	fileName
		.replace(/\.[a-z0-9]{1,8}$/i, '')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, RECEIPT_NAME_MAX);

/** Bytes as somebody would say them out loud. Powers of ten, the way a phone counts. */
export const formatFileSize = (bytes: number): string => {
	const size = Math.max(0, Math.round(bytes));

	if (size < 1000) return `${size} B`;

	const kb = size / 1000;

	if (kb < 1000) return `${Math.round(kb)} kB`;

	return `${(kb / 1000).toFixed(1).replace(/\.0$/, '')} MB`;
};

/**
 * Why this file cannot be a receipt, or `null` if it can.
 *
 * Said on the client so that somebody who picked a 40 MB photo finds out before
 * the upload rather than after it, and said again in `storage.rules`, which is
 * what actually decides. A message rather than a boolean, because "that file is
 * too big" and "that has to be a PDF or a photo" are different things to fix.
 */
export const receiptProblem = (file: { type: string; size: number }): string | null => {
	if (!kindOf(file.type)) return 'A receipt has to be a PDF, a JPEG or a PNG.';
	if (file.size === 0) return 'That file is empty.';
	if (file.size > RECEIPT_MAX_BYTES) {
		return `That file is ${formatFileSize(file.size)}, and the limit is ${formatFileSize(RECEIPT_MAX_BYTES)}.`;
	}

	return null;
};
