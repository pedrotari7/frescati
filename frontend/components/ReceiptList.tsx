'use client';

import { useEffect, useRef, useState } from 'react';
import type { DragEvent, RefObject } from 'react';
import Link from 'next/link';
import { ArrowDownTrayIcon, LinkIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Receipt } from '@shared/types';
import {
	RECEIPT_CONTENT_TYPES,
	RECEIPT_MAX_BYTES,
	RECEIPT_NAME_MAX,
	defaultReceiptName,
	formatFileSize,
	receiptHref,
	receiptKindLabel,
	receiptProblem,
} from '@shared/receipts';
import { formatCivilDate } from '@shared/format';
import AddPanel from './AddPanel';
import Button from './Button';
import RemoveButton from './RemoveButton';
import { Field, TextInput } from './Field';
import { ListCard, ListEmpty, listRow } from './Section';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus, press, utils } from '../lib/styles';

const styles = stylex.create({
	zone: {
		display: 'flex',
		flexDirection: 'column',
		gap: 12,
		borderRadius: 16,
		transitionProperty: 'background-color, outline-color',
		transitionDuration: '0.15s',
	},
	/*
	 * An outline rather than a border, so the area lights up without everything
	 * inside it shifting by a pixel as the file comes over. It sits outside the
	 * box, which is what the offset is for: the dashes clear the card's own edge
	 * instead of tracing it.
	 */
	zoneOver: { backgroundColor: tint.brand5, outline: `2px dashed ${tint.brand60}`, outlineOffset: 4 },

	row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 12 },
	/*
	 * The link is a layer across the whole row rather than a box around the text,
	 * so the wash under a pointer runs to the far edge, behind the buttons, and
	 * not up to the first of them. Pulled out over the row's padding so the wash
	 * has room around the text. The text sits over it and lets a tap through, and
	 * the buttons sit over it and keep their own.
	 */
	open: {
		position: 'absolute',
		insetBlock: 6,
		insetInline: -8,
		borderRadius: 8,
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
	},
	body: { position: 'relative', pointerEvents: 'none', minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	actions: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8 },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	facts: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	icon: { width: 16, height: 16 },

	/*
	 * The browser draws the button inside a file input, and `::file-selector-button`
	 * is the only way to reach it. Tailwind spelled this `file:` and stacked the
	 * hover as `hover:file:`, which lands on the input rather than the button, so
	 * the nesting below is the same selector it always compiled to.
	 */
	picker: {
		color: colors.muted,
		width: '100%',
		fontSize: 14,
		lineHeight: '20px',
		'::file-selector-button': {
			color: colors.ink,
			marginRight: 12,
			cursor: 'pointer',
			borderRadius: 8,
			borderWidth: 0,
			backgroundColor: { default: tint.white8, [bp.hover]: { default: null, ':hover': tint.white12 } },
			paddingInline: 12,
			paddingBlock: 8,
			fontSize: 14,
			lineHeight: '20px',
		},
	},
	problem: { color: colors.out, fontSize: 14, lineHeight: '20px' },
	chosen: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	/* Drawn only where there is a pointer that can drag. See `handleDrop`. */
	hint: {
		color: colors.faint,
		display: { default: 'none', [bp.fine]: 'block' },
		paddingInline: 4,
		textAlign: 'center',
		fontSize: 12,
		lineHeight: '16px',
	},
});

/**
 * The receipt an admin is filling in: which file, what to call it, and whether
 * the pair is ready to send.
 *
 * `storage.rules` refuses an oversized or wrong-typed file from the far side
 * and is what actually decides. `receiptProblem` is here so that picking a
 * 40 MB photo is a sentence rather than a failed upload, which on a phone is a
 * spinner followed by a toast that cannot say why.
 *
 * The name follows the file until somebody writes their own, and then it stops
 * for good. `written` is the whole of that: whether the admin has touched the
 * field, which is not the same question as whether it has anything in it.
 * Reading emptiness instead got both halves wrong. A field cleared on purpose
 * filled itself back in from the next file, which is precisely the typing this
 * is meant to protect; and a name left as the first file's suggestion stayed
 * put when the file was swapped, so picking the wrong file first filed the
 * right one under the wrong name.
 */
const useReceiptDraft = () => {
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState('');
	const [written, setWritten] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const input = useRef<HTMLInputElement>(null);

	const pick = (picked: File | null) => {
		setFile(picked);
		setProblem(picked ? receiptProblem(picked) : null);

		if (picked && !written) setName(defaultReceiptName(picked.name));
	};

	const rename = (next: string) => {
		setName(next);
		setWritten(true);
	};

	// The input is cleared through the DOM as well as through state, since a file
	// input holds its own value and picking the same file twice after a failed
	// upload raises no change event at all.
	const clear = () => {
		setFile(null);
		setName('');
		setWritten(false);
		setProblem(null);
		if (input.current) input.current.value = '';
	};

	return {
		file,
		name,
		problem,
		input,
		valid: Boolean(file) && !problem && name.trim().length > 0,
		pick,
		rename,
		clear,
	};
};

/**
 * The whole area takes a dropped file, not just the picker inside the form.
 *
 * On a desktop the receipt is a PDF sitting in a folder behind the browser
 * window, and dragging it across is one gesture where the picker is three, the
 * last of which is finding the file again in a dialog. Dropping opens the form
 * with the file already in it, so what is left is checking the name and
 * pressing the button.
 *
 * A phone has no drag and never fires any of this, which is why the line
 * advertising it is drawn only where there is a pointer to do it with.
 *
 * Nothing is handed over until a file actually arrives, so a drag carrying
 * anything else, or one over a list nobody may edit, leaves the caller's state
 * alone and the browser's own handling of it with it.
 */
const useFileDrop = (enabled: boolean, onFiles: (files: FileList) => void) => {
	const [over, setOver] = useState(false);

	const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

	const onDragOver = (event: DragEvent<HTMLDivElement>) => {
		if (!enabled || !carriesFiles(event)) return;

		// Without the first the browser keeps the drop and opens the file in a tab
		// of its own. Without the second the cursor says this is a move.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';

		setOver(true);
	};

	const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
		// Crossing from one row to the next leaves a child rather than the area, and
		// everything under the pointer here is a child.
		if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;

		setOver(false);
	};

	const onDrop = (event: DragEvent<HTMLDivElement>) => {
		if (!enabled || !carriesFiles(event)) return;

		event.preventDefault();
		setOver(false);

		// The first of however many, since a receipt is one file. Nothing is hidden
		// by that: the form fills its name in from the file it took.
		if (!event.dataTransfer.files?.[0]) return;

		onFiles(event.dataTransfer.files);
	};

	return { over, onDragOver, onDragLeave, onDrop };
};

/**
 * The two things an admin says about a receipt: which file, and what to call it.
 *
 * The chosen line under the picker is the receipt as the app reads it, kind and
 * size, so a photo of the wrong thing is caught before the upload rather than
 * after. It gives way to the problem, since a file that will be refused has
 * nothing worth describing.
 */
const ReceiptFields = ({
	input,
	file,
	name,
	problem,
	onPick,
	onName,
}: {
	input: RefObject<HTMLInputElement | null>;
	file: File | null;
	name: string;
	problem: string | null;
	onPick: (picked: File | null) => void;
	onName: (next: string) => void;
}) => (
	<>
		<Field
			label='The file'
			hint={`A PDF, or a photo of a paper receipt. Up to ${formatFileSize(RECEIPT_MAX_BYTES)}.`}
		>
			{/* The native input rather than a button in front of a hidden one: it is
			    the control a phone knows how to open its own files and camera roll
			    with, and the only one a screen reader announces as a file picker
			    without help. */}
			<input
				ref={input}
				type='file'
				accept={RECEIPT_CONTENT_TYPES.join(',')}
				aria-label='Receipt file'
				onChange={event => onPick(event.target.files?.[0] ?? null)}
				{...stylex.props(styles.picker)}
			/>
		</Field>

		{problem && <p {...stylex.props(styles.problem)}>{problem}</p>}

		{file && !problem && (
			<p {...stylex.props(styles.chosen)}>
				{receiptKindLabel(file.type)} · {formatFileSize(file.size)}
			</p>
		)}

		<Field label='What it is' hint='What people will see in the list, and what the file downloads as.'>
			<TextInput
				value={name}
				onChange={event => onName(event.target.value)}
				placeholder='Pitch invoice, spring 2026'
				maxLength={RECEIPT_NAME_MAX}
			/>
		</Field>
	</>
);

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
	seasonId,
	receipts,
	canEdit,
	onUpload,
	onDownload,
	onCopyLink,
	onDelete,
}: {
	seasonId: string;
	receipts: Receipt[];
	canEdit: boolean;
	onUpload: (file: File, name: string) => Promise<boolean>;
	onDownload: (receipt: Receipt) => Promise<void>;
	onCopyLink: (receipt: Receipt) => Promise<void>;
	onDelete: (receipt: Receipt) => void;
}) => {
	const [adding, setAdding] = useState(false);
	const [dropped, setDropped] = useState<FileList | null>(null);
	const { file, name, problem, input, valid, pick, rename, clear } = useReceiptDraft();

	/**
	 * Put a dropped file into the picker as well as into the form.
	 *
	 * A file input holds its own value, and a drop that landed somewhere else in
	 * the section never touched it, so without this the control reads "No file
	 * chosen" beside a form that has already named the file. It happens here
	 * rather than in the drop handler because the form is usually shut when the
	 * file arrives, and the input it belongs in does not exist yet.
	 *
	 * One file, because that is what the input takes, and a real `FileList`,
	 * because that is the only thing its setter accepts. jsdom has no
	 * `DataTransfer` to build one with, so `e2e/receipts.spec.ts` is where this
	 * particular line gets checked.
	 */
	useEffect(() => {
		if (!dropped) return;

		if (input.current && dropped instanceof FileList && dropped.length === 1) input.current.files = dropped;

		setDropped(null);
	}, [dropped, input]);

	const close = () => {
		clear();
		setAdding(false);
	};

	const handleUpload = async () => {
		if (!file || !valid) return;

		const ok = await onUpload(file, name.trim());

		if (ok) close();
	};

	const { over, onDragOver, onDragLeave, onDrop } = useFileDrop(canEdit, files => {
		setAdding(true);
		pick(files[0]);
		setDropped(files);
	});

	return (
		<div
			{...stylex.props(styles.zone, over && styles.zoneOver)}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<ListCard>
				{receipts.length === 0 ? (
					<ListEmpty>Nothing here yet.</ListEmpty>
				) : (
					receipts.map(receipt => (
						<div key={receipt.id} {...stylex.props(listRow, styles.row)}>
							{/* The same screen the copied link opens, so what somebody sees
							    tapping a receipt here is what the group chat sees. */}
							<Link
								href={receiptHref(seasonId, receipt.id)}
								aria-labelledby={`${receipt.id}-name ${receipt.id}-facts`}
								{...stylex.props(styles.open, press.wash, focus.ring)}
							/>

							<div {...stylex.props(styles.body)}>
								<p id={`${receipt.id}-name`} {...stylex.props(styles.name, utils.truncate)}>
									{receipt.name}
								</p>
								<p id={`${receipt.id}-facts`} {...stylex.props(styles.facts)}>
									{receiptKindLabel(receipt.contentType)} · {formatFileSize(receipt.size)} ·{' '}
									{formatCivilDate(receipt.uploadedAt.slice(0, 10))}
								</p>
							</div>

							<div {...stylex.props(styles.actions)}>
								<Button
									size='sm'
									variant='secondary'
									aria-label={`Download ${receipt.name}`}
									onClick={() => onDownload(receipt)}
								>
									<ArrowDownTrayIcon {...stylex.props(styles.icon)} aria-hidden='true' />
								</Button>

								<Button
									size='sm'
									variant='ghost'
									aria-label={`Copy a link to ${receipt.name}`}
									onClick={() => onCopyLink(receipt)}
								>
									<LinkIcon {...stylex.props(styles.icon)} aria-hidden='true' />
								</Button>

								{canEdit && <RemoveButton what={receipt.name} onRemove={() => onDelete(receipt)} />}
							</div>
						</div>
					))
				)}
			</ListCard>

			{canEdit && (
				<>
					<AddPanel
						open={adding}
						onOpen={() => setAdding(true)}
						onCancel={close}
						onSubmit={handleUpload}
						label='Add a receipt'
						action='Upload it'
						canSubmit={valid}
					>
						<ReceiptFields
							input={input}
							file={file}
							name={name}
							problem={problem}
							onPick={pick}
							onName={rename}
						/>
					</AddPanel>

					<p {...stylex.props(styles.hint)}>{over ? 'Drop it here.' : 'Or drag a file in here.'}</p>
				</>
			)}
		</div>
	);
};

export default ReceiptList;
