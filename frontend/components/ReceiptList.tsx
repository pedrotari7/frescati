'use client';

import { useRef, useState } from 'react';
import { ArrowDownTrayIcon, LinkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Receipt } from '@shared/types';
import {
	RECEIPT_CONTENT_TYPES,
	RECEIPT_MAX_BYTES,
	RECEIPT_NAME_MAX,
	defaultReceiptName,
	formatFileSize,
	receiptKindLabel,
	receiptProblem,
} from '@shared/receipts';
import { formatCivilDate } from '@shared/format';
import Button from './Button';
import { Field, TextInput } from './Field';
import { ListCard, ListEmpty } from './Section';

/**
 * The season's paperwork, and the two things anybody does with it.
 *
 * Download is why any of this exists. A Swedish employer pays a
 * friskvardsbidrag against a receipt, so every member needs their own copy of a
 * document only the admin who paid the invoice has. Copy link is the other half, because the
 * way this actually gets to fifteen people is somebody pasting it into the
 * group chat. That link goes to a screen in the app rather than at the file, so
 * it opens for the squad and for nobody else; `shared/receipts.ts` has the
 * argument.
 *
 * Adding and removing stays with the admins, unlike the kit register beside it.
 * A handover happens at the pitch between two people and has to be recordable
 * by either, but a receipt is going to somebody's payroll department, and a
 * file anybody could swap is a file nobody should be handing over.
 */
const ReceiptList = ({
	receipts,
	canEdit,
	onUpload,
	onDownload,
	onCopyLink,
	onDelete,
}: {
	receipts: Receipt[];
	canEdit: boolean;
	onUpload: (file: File, name: string) => Promise<boolean>;
	onDownload: (receipt: Receipt) => Promise<void>;
	onCopyLink: (receipt: Receipt) => Promise<void>;
	onDelete: (receipt: Receipt) => void;
}) => {
	const [adding, setAdding] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const input = useRef<HTMLInputElement>(null);

	const valid = Boolean(file) && !problem && name.trim().length > 0;

	// The input is cleared through the DOM as well as through state, since a
	// file input holds its own value and picking the same file twice after a
	// failed upload raises no change event at all.
	const close = () => {
		setFile(null);
		setName('');
		setProblem(null);
		setAdding(false);
		if (input.current) input.current.value = '';
	};

	/**
	 * Say what is wrong with a file while it can still be swapped.
	 *
	 * `storage.rules` refuses the same two things from the far side and is what
	 * actually decides. This is here so that picking a 40 MB photo is a sentence
	 * rather than a failed upload, which on a phone is a spinner followed by a
	 * toast that cannot say why.
	 */
	const pick = (picked: File | null) => {
		setFile(picked);
		setProblem(picked ? receiptProblem(picked) : null);

		if (picked) setName(current => current.trim() || defaultReceiptName(picked.name));
	};

	const handleUpload = async () => {
		if (!file || !valid) return;

		const ok = await onUpload(file, name.trim());

		if (ok) close();
	};

	return (
		<div className='space-y-3'>
			<ListCard>
				{receipts.length === 0 ? (
					<ListEmpty>Nothing here yet.</ListEmpty>
				) : (
					receipts.map(receipt => (
						<div key={receipt.id} className='flex items-center gap-2 py-3'>
							<div className='min-w-0 flex-1'>
								<p className='text-ink truncate text-sm font-medium'>{receipt.name}</p>
								<p className='text-faint mt-0.5 text-xs'>
									{receiptKindLabel(receipt.contentType)} · {formatFileSize(receipt.size)} ·{' '}
									{formatCivilDate(receipt.uploadedAt.slice(0, 10))}
								</p>
							</div>

							<Button
								size='sm'
								variant='secondary'
								aria-label={`Download ${receipt.name}`}
								onClick={() => onDownload(receipt)}
							>
								<ArrowDownTrayIcon className='size-4' aria-hidden='true' />
							</Button>

							<Button
								size='sm'
								variant='ghost'
								aria-label={`Copy a link to ${receipt.name}`}
								onClick={() => onCopyLink(receipt)}
							>
								<LinkIcon className='size-4' aria-hidden='true' />
							</Button>

							{canEdit && (
								<Button
									size='sm'
									variant='ghost'
									aria-label={`Remove ${receipt.name}`}
									onClick={() => onDelete(receipt)}
								>
									<TrashIcon className='size-4' aria-hidden='true' />
								</Button>
							)}
						</div>
					))
				)}
			</ListCard>

			{canEdit &&
				(adding ? (
					<section className='glass space-y-4 rounded-2xl p-5'>
						<h3 className='text-ink font-semibold'>Add a receipt</h3>

						<Field
							label='The file'
							hint={`A PDF, or a photo of a paper receipt. Up to ${formatFileSize(RECEIPT_MAX_BYTES)}.`}
						>
							{/* The native input rather than a button in front of a hidden
							    one: it is the control a phone knows how to open its own
							    files and camera roll with, and the only one a screen
							    reader announces as a file picker without help. */}
							<input
								ref={input}
								type='file'
								accept={RECEIPT_CONTENT_TYPES.join(',')}
								aria-label='Receipt file'
								onChange={event => pick(event.target.files?.[0] ?? null)}
								className='text-muted file:text-ink w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-2 file:text-sm hover:file:bg-white/12'
							/>
						</Field>

						{problem && <p className='text-out text-sm'>{problem}</p>}

						{file && !problem && (
							<p className='text-faint text-xs'>
								{receiptKindLabel(file.type)} · {formatFileSize(file.size)}
							</p>
						)}

						<Field
							label='What it is'
							hint='What people will see in the list, and what the file downloads as.'
						>
							<TextInput
								value={name}
								onChange={event => setName(event.target.value)}
								placeholder='Pitch invoice, spring 2026'
								maxLength={RECEIPT_NAME_MAX}
							/>
						</Field>

						<div className='flex gap-3'>
							<Button variant='primary' fullWidth onClick={handleUpload} disabled={!valid}>
								Upload it
							</Button>
							<Button variant='ghost' fullWidth onClick={close}>
								Cancel
							</Button>
						</div>
					</section>
				) : (
					<Button variant='secondary' fullWidth onClick={() => setAdding(true)}>
						<PlusIcon className='size-4' aria-hidden='true' />
						Add a receipt
					</Button>
				))}
		</div>
	);
};

export default ReceiptList;
