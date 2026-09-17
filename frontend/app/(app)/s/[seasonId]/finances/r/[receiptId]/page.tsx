'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownTrayIcon, DocumentTextIcon, LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Receipt } from '@shared/types';
import { formatFileSize, receiptHref, receiptKindLabel } from '@shared/receipts';
import { formatCivilDate } from '@shared/format';
import { useSeasonContext } from '../../../../../../../components/SeasonProvider';
import { useReceipts, useUsersByUid } from '../../../../../../../hooks/useData';
import { useReceiptActions } from '../../../../../../../hooks/useReceiptActions';
import { useWrite } from '../../../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../../../components/ConfirmDialog';
import { displayNameOf } from '../../../../../../../lib/people';
import { deleteReceipt } from '../../../../../../../lib/db/receipts';
import SeasonShell from '../../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../../components/Skeleton';
import EmptyState from '../../../../../../../components/EmptyState';
import LoadFailed from '../../../../../../../components/LoadFailed';
import Button from '../../../../../../../components/Button';
import { CONTROL } from '../../../../../../../components/Field';
import { colors, fonts } from '../../../../../../tokens.stylex';
import { surfaces } from '../../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	card: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },
	share: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 20 },

	head: { display: 'flex', alignItems: 'flex-start', gap: 12 },
	doc: { color: colors.faint, marginTop: 2, width: 24, height: 24, flexShrink: 0 },
	body: { minWidth: 0 },
	/* Wraps mid-word rather than truncating. A receipt is named by whoever
	   scanned it, so this is regularly one unbroken forty-character string, and
	   an ellipsis on the one screen the file is identified from is no use. */
	name: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600, overflowWrap: 'break-word' },
	meta: { color: colors.faint, marginTop: 4, fontSize: 12, lineHeight: '16px' },
	blurb: { color: colors.faint, fontSize: 12, lineHeight: 1.625 },
	heading: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },

	/* Monospaced so a link somebody has to read out loud has no ambiguous
	   characters in it. */
	link: { fontFamily: fonts.mono, fontSize: 12, lineHeight: '16px' },

	download: { width: 20, height: 20 },
	copy: { width: 16, height: 16 },
});

/**
 * Every reason this screen has no receipt to draw, drawn as the screen rather
 * than as a blank.
 *
 * The chevron is on all four, because almost everybody arrives here by opening
 * a pasted link with nothing behind them to go back to, and a screen that draws
 * no chevron while it loads is one somebody taps past.
 */
const Unavailable = ({
	reason,
	seasonName,
	books,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'private' | 'missing';
	seasonName?: string;
	books: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Receipt' subtitle={seasonName} backHref={books}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='this receipt' onRetry={onRetry} />}
		{reason === 'private' && (
			<EmptyState
				icon={<LockClosedIcon />}
				title='Not yours to open'
				message='A receipt belongs to the people in that season. Ask whoever runs it to add you.'
			/>
		)}
		{reason === 'missing' && (
			<EmptyState
				icon={<DocumentTextIcon />}
				title='Receipt not found'
				message='It has been removed, or the link is wrong.'
			/>
		)}
	</SeasonShell>
);

/**
 * Removing a receipt, which takes the file with it.
 *
 * Confirmed first, because every link anybody has to it stops working. Then
 * `replace` rather than `push`, so the back chevron does not hand somebody
 * straight back to a receipt that is no longer there. `AppHistory` counts a
 * replace as no step at all, which is what keeps the books' own chevron honest.
 */
const useRemoveReceipt = (seasonId: string, books: string) => {
	const write = useWrite();
	const confirm = useConfirm();
	const router = useRouter();

	return async (receipt: Receipt) => {
		const ok = await confirm({
			title: `Remove ${receipt.name}?`,
			message: 'The file goes with it, and every link anybody has to it stops working.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		const removed = await write(() => deleteReceipt(seasonId, receipt.id), `Couldn't remove ${receipt.name}.`);

		if (removed) router.replace(books);
	};
};

/** The receipt itself, and the one thing everybody came here to do with it. */
const ReceiptCard = ({
	receipt,
	uploader,
	onDownload,
}: {
	receipt: Receipt;
	uploader: string;
	onDownload: () => void;
}) => (
	<section {...stylex.props(surfaces.glass, styles.card)}>
		<div {...stylex.props(styles.head)}>
			<DocumentTextIcon {...stylex.props(styles.doc)} aria-hidden='true' />
			<div {...stylex.props(styles.body)}>
				<h2 {...stylex.props(styles.name)}>{receipt.name}</h2>
				<p {...stylex.props(styles.meta)}>
					{receiptKindLabel(receipt.contentType)} · {formatFileSize(receipt.size)} · added by {uploader} on{' '}
					{formatCivilDate(receipt.uploadedAt.slice(0, 10))}
				</p>
			</div>
		</div>

		<Button variant='primary' size='lg' fullWidth onClick={onDownload}>
			<ArrowDownTrayIcon {...stylex.props(styles.download)} aria-hidden='true' />
			Download
		</Button>

		<p {...stylex.props(styles.blurb)}>
			Hand this to your employer if you claim friskv&aring;rdsbidrag. It is what says the money went on playing
			football.
		</p>
	</section>
);

/** The link, and why it is safe to paste into the group chat. */
const ShareCard = ({ seasonName, url, onCopy }: { seasonName: string; url: string; onCopy: () => void }) => (
	<section {...stylex.props(surfaces.glass, styles.share)}>
		<h2 {...stylex.props(styles.heading)}>Share it</h2>
		<p {...stylex.props(styles.blurb)}>
			This link opens for anybody in {seasonName} and for nobody else, so it is safe in the group chat. It asks
			whoever follows it to sign in, the same as every other screen.
		</p>

		{/* Readable as well as copyable. The button is the way anybody will actually
		    do this, but a browser that refuses the clipboard, an old WebView, an
		    insecure context, leaves somebody with a link they can still read out. */}
		<input
			readOnly
			value={url}
			onFocus={event => event.currentTarget.select()}
			aria-label='Link to this receipt'
			{...stylex.props(CONTROL, styles.link)}
		/>

		<Button variant='secondary' fullWidth onClick={onCopy}>
			<LinkIcon {...stylex.props(styles.copy)} aria-hidden='true' />
			Copy link
		</Button>
	</section>
);

/**
 * One receipt, on a screen of its own.
 *
 * This is what the copy-link button in the books hands out, and the reason the
 * feature has a screen at all. Cloud Storage will happily mint a URL that
 * downloads the file for anybody holding it, forever, which would quietly undo
 * the rule that says a receipt belongs to the squad. A link into the app costs
 * one extra tap and takes whoever opens it through the same sign-in and the
 * same rules as every other screen.
 *
 * Almost everybody arrives here by opening a pasted link, with nothing behind
 * them for a chevron to go back to, which is the case `backHref` is for. It
 * sits on every branch below, loading and error included, since a screen that
 * draws no chevron while it loads is one somebody taps past.
 */
const ReceiptPage = ({ params }: { params: Promise<{ seasonId: string; receiptId: string }> }) => {
	const { receiptId } = use(params);
	const { seasonId, season, loading, error, retry, isAdmin, isMember } = useSeasonContext();
	const squad = isMember || isAdmin;

	const { receipts, loading: receiptsLoading } = useReceipts(seasonId, squad);
	const { usersByUid } = useUsersByUid();
	const { download, copyLink } = useReceiptActions(seasonId);
	const books = `/s/${seasonId}/finances`;
	const remove = useRemoveReceipt(seasonId, books);

	// The address of this screen, which is the thing to copy. Read after mount
	// rather than at render, because this component is still server-rendered
	// once, where there is no `window` and no origin to read.
	const [url, setUrl] = useState('');

	useEffect(() => {
		setUrl(`${window.location.origin}${receiptHref(seasonId, receiptId)}`);
	}, [seasonId, receiptId]);

	if (loading || receiptsLoading) return <Unavailable reason='loading' books={books} onRetry={retry} />;
	if (error) return <Unavailable reason='error' books={books} onRetry={retry} />;

	// Somebody who played once and followed a link out of the group chat. The
	// rules refuse them the collection outright, so the app never asks for it,
	// and `private` says why rather than leaving them on a screen that says the
	// receipt does not exist.
	if (!season || !squad) return <Unavailable reason='private' books={books} onRetry={retry} />;

	const receipt = receipts.find(candidate => candidate.id === receiptId);

	if (!receipt) {
		return <Unavailable reason='missing' seasonName={season.name} books={books} onRetry={retry} />;
	}

	return (
		<SeasonShell title='Receipt' subtitle={season.name} backHref={books}>
			<div {...stylex.props(styles.page)}>
				<ReceiptCard
					receipt={receipt}
					uploader={displayNameOf(usersByUid.get(receipt.uploadedBy))}
					onDownload={() => download(receipt)}
				/>

				<ShareCard seasonName={season.name} url={url} onCopy={() => copyLink(receipt)} />

				{isAdmin && (
					<Button variant='danger' fullWidth onClick={() => remove(receipt)}>
						Remove this receipt
					</Button>
				)}
			</div>
		</SeasonShell>
	);
};

export default ReceiptPage;
