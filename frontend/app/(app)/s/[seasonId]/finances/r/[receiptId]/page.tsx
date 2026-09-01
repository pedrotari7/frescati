'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownTrayIcon, DocumentTextIcon, LinkIcon, LockClosedIcon } from '@heroicons/react/24/outline';
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
	const write = useWrite();
	const confirm = useConfirm();
	const router = useRouter();

	// The address of this screen, which is the thing to copy. Read after mount
	// rather than at render, because this component is still server-rendered
	// once, where there is no `window` and no origin to read.
	const [url, setUrl] = useState('');

	useEffect(() => {
		setUrl(`${window.location.origin}${receiptHref(seasonId, receiptId)}`);
	}, [seasonId, receiptId]);

	const books = `/s/${seasonId}/finances`;

	if (loading || receiptsLoading) {
		return (
			<SeasonShell title='Receipt' backHref={books}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Receipt' backHref={books}>
				<LoadFailed what='this receipt' onRetry={retry} />
			</SeasonShell>
		);
	}

	// Somebody who played once and followed a link out of the group chat. The
	// rules refuse them the collection outright, so the app never asks for it,
	// and this says why rather than leaving them on a screen that says the
	// receipt does not exist.
	if (!season || !squad) {
		return (
			<SeasonShell title='Receipt' backHref={books}>
				<EmptyState
					icon={<LockClosedIcon />}
					title='Not yours to open'
					message='A receipt belongs to the people in that season. Ask whoever runs it to add you.'
				/>
			</SeasonShell>
		);
	}

	const receipt = receipts.find(candidate => candidate.id === receiptId);

	if (!receipt) {
		return (
			<SeasonShell title='Receipt' subtitle={season.name} backHref={books}>
				<EmptyState
					icon={<DocumentTextIcon />}
					title='Receipt not found'
					message='It has been removed, or the link is wrong.'
				/>
			</SeasonShell>
		);
	}

	const handleDelete = async () => {
		const ok = await confirm({
			title: `Remove ${receipt.name}?`,
			message: 'The file goes with it, and every link anybody has to it stops working.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		const removed = await write(() => deleteReceipt(seasonId, receipt.id), `Couldn't remove ${receipt.name}.`);

		// `replace`, so the back chevron doesn't hand somebody straight back to a
		// receipt that is no longer there. `AppHistory` counts a replace as no
		// step at all, which is what keeps the books' own chevron honest.
		if (removed) router.replace(books);
	};

	return (
		<SeasonShell title='Receipt' subtitle={season.name} backHref={books}>
			<div className='space-y-6 p-4'>
				<section className='glass space-y-4 rounded-2xl p-5'>
					<div className='flex items-start gap-3'>
						<DocumentTextIcon className='text-faint mt-0.5 size-6 shrink-0' aria-hidden='true' />
						<div className='min-w-0'>
							<h2 className='text-ink font-semibold break-words'>{receipt.name}</h2>
							<p className='text-faint mt-1 text-xs'>
								{receiptKindLabel(receipt.contentType)} · {formatFileSize(receipt.size)} · added by{' '}
								{displayNameOf(usersByUid.get(receipt.uploadedBy))} on{' '}
								{formatCivilDate(receipt.uploadedAt.slice(0, 10))}
							</p>
						</div>
					</div>

					<Button variant='primary' size='lg' fullWidth onClick={() => download(receipt)}>
						<ArrowDownTrayIcon className='size-5' aria-hidden='true' />
						Download
					</Button>

					<p className='text-faint text-xs leading-relaxed'>
						Hand this to your employer if you claim friskv&aring;rdsbidrag. It is what says the money went
						on playing football.
					</p>
				</section>

				<section className='glass space-y-3 rounded-2xl p-5'>
					<h2 className='text-ink font-semibold'>Share it</h2>
					<p className='text-faint text-xs leading-relaxed'>
						This link opens for anybody in {season.name} and for nobody else, so it is safe in the group
						chat. It asks whoever follows it to sign in, the same as every other screen.
					</p>

					{/* Readable as well as copyable. The button is the way anybody
					    will actually do this, but a browser that refuses the
					    clipboard, an old WebView, an insecure context, leaves
					    somebody with a link they can still read out. */}
					<input
						readOnly
						value={url}
						onFocus={event => event.currentTarget.select()}
						aria-label='Link to this receipt'
						className={`${CONTROL} font-mono text-xs`}
					/>

					<Button variant='secondary' fullWidth onClick={() => copyLink(receipt)}>
						<LinkIcon className='size-4' aria-hidden='true' />
						Copy link
					</Button>
				</section>

				{isAdmin && (
					<Button variant='danger' fullWidth onClick={handleDelete}>
						Remove this receipt
					</Button>
				)}
			</div>
		</SeasonShell>
	);
};

export default ReceiptPage;
