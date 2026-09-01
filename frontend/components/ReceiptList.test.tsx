import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Receipt } from '@shared/types';
import ReceiptList from './ReceiptList';

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
	id: 'r1',
	name: 'Pitch invoice, spring 2026',
	contentType: 'application/pdf',
	size: 318_000,
	uploadedBy: 'bo',
	uploadedAt: '2026-03-12T10:00:00.000Z',
	...over,
});

/** A `File` the way a picker hands one over, with a size jsdom won't invent. */
const file = (name: string, type: string, size: number): File => {
	const picked = new File(['x'], name, { type });

	Object.defineProperty(picked, 'size', { value: size });

	return picked;
};

const list = (receipts: Receipt[], canEdit = false) => {
	const onUpload = jest.fn().mockResolvedValue(true);
	const onDownload = jest.fn().mockResolvedValue(undefined);
	const onCopyLink = jest.fn().mockResolvedValue(undefined);
	const onDelete = jest.fn();

	render(
		<ReceiptList
			receipts={receipts}
			canEdit={canEdit}
			onUpload={onUpload}
			onDownload={onDownload}
			onCopyLink={onCopyLink}
			onDelete={onDelete}
		/>
	);

	return { onUpload, onDownload, onCopyLink, onDelete };
};

/** The controls are `Button`s, which set their own busy state on the way. */
const press = async (name: string | RegExp) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

const pickFile = async (picked: File) => {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Receipt file'), { target: { files: [picked] } });
	});
};

/**
 * A file let go over the receipts area.
 *
 * jsdom has no `DataTransfer`, so the drag carries a stand-in with the two
 * things the component reads off one. What it cannot carry is a real
 * `FileList`, which is the only thing a file input's own value will accept, so
 * the half of this that fills the picker in is checked in `e2e/receipts.spec.ts`
 * where there is a browser to build one.
 */
const dropFile = async (picked: File | null, onto: HTMLElement) => {
	await act(async () => {
		fireEvent.drop(onto, {
			dataTransfer: { files: picked ? [picked] : [], types: picked ? ['Files'] : ['text/plain'] },
		});
	});
};

describe('the list', () => {
	it('says what a receipt is without opening it', () => {
		list([receipt()]);

		expect(screen.getByText('Pitch invoice, spring 2026')).toBeInTheDocument();
		expect(screen.getByText(/PDF · 318 kB · Thu 12 Mar/)).toBeInTheDocument();
	});

	it('offers a download and a link to everybody', async () => {
		const { onDownload, onCopyLink } = list([receipt()]);

		await press('Download Pitch invoice, spring 2026');
		await press('Copy a link to Pitch invoice, spring 2026');

		expect(onDownload).toHaveBeenCalledWith(receipt());
		expect(onCopyLink).toHaveBeenCalledWith(receipt());
	});

	// A receipt goes to somebody's payroll department, so who may swap the file
	// is a different question from who may hand a ball over at the pitch.
	it('keeps adding and removing to the admins', () => {
		list([receipt()]);

		expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Add a receipt' })).not.toBeInTheDocument();
	});

	it('lets an admin remove one', async () => {
		const { onDelete } = list([receipt()], true);

		await press('Remove Pitch invoice, spring 2026');

		expect(onDelete).toHaveBeenCalledWith(receipt());
	});

	it('says so when the season has none', () => {
		list([]);

		expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
	});
});

describe('adding one', () => {
	const openForm = async () => {
		list([], true);
		await press('Add a receipt');
	};

	it('names the file for you and uploads it', async () => {
		const { onUpload } = list([], true);
		await press('Add a receipt');

		const picked = file('pitch_invoice-spring_2026.pdf', 'application/pdf', 318_000);
		await pickFile(picked);

		expect(screen.getByDisplayValue('pitch invoice spring 2026')).toBeInTheDocument();

		await press('Upload it');

		expect(onUpload).toHaveBeenCalledWith(picked, 'pitch invoice spring 2026');
	});

	// The rules refuse the same file from the far side. This is so that picking
	// it is a sentence rather than a spinner and a toast that cannot say why.
	it('refuses a file payroll will not open, before the upload', async () => {
		await openForm();

		await pickFile(file('season.zip', 'application/zip', 1000));

		expect(screen.getByText('A receipt has to be a PDF, a JPEG or a PNG.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Upload it' })).toBeDisabled();
	});

	it('names the size and the limit when a file is too big', async () => {
		await openForm();

		await pickFile(file('kvitto.jpg', 'image/jpeg', 40_000_000));

		expect(screen.getByText(/40 MB, and the limit is 10 MB/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Upload it' })).toBeDisabled();
	});

	it('will not upload a file with no name typed against it', async () => {
		await openForm();

		await pickFile(file('.pdf', 'application/pdf', 1000));

		expect(screen.getByRole('button', { name: 'Upload it' })).toBeDisabled();
	});

	// Otherwise the form comes back holding a file that has already gone in.
	it('empties the form once the upload lands', async () => {
		const { onUpload } = list([], true);
		await press('Add a receipt');

		await pickFile(file('kvitto.pdf', 'application/pdf', 1000));
		await press('Upload it');

		expect(onUpload).toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Add a receipt' })).toBeInTheDocument();
	});

	// A refused write has already been reported by `useWrite`, and what somebody
	// needs to try again with is the thing they typed.
	it('leaves the form alone when the upload fails', async () => {
		const onUpload = jest.fn().mockResolvedValue(false);

		render(
			<ReceiptList
				receipts={[]}
				canEdit
				onUpload={onUpload}
				onDownload={jest.fn()}
				onCopyLink={jest.fn()}
				onDelete={jest.fn()}
			/>
		);

		await press('Add a receipt');
		await pickFile(file('kvitto.pdf', 'application/pdf', 1000));
		await press('Upload it');

		expect(screen.getByDisplayValue('kvitto')).toBeInTheDocument();
	});
});

/**
 * Dragging a file in, which is the desktop half of picking one.
 *
 * The whole area takes the drop rather than the picker inside the form, so the
 * tests below let go over a row and over the empty card, both of which are as
 * far from the input as this gets.
 */
describe('dropping one in', () => {
	it('opens the form on a file let go anywhere in the area', async () => {
		const { onUpload } = list([receipt()], true);

		const picked = file('pitch_invoice-spring_2026.pdf', 'application/pdf', 318_000);
		await dropFile(picked, screen.getByText('Pitch invoice, spring 2026'));

		expect(screen.getByDisplayValue('pitch invoice spring 2026')).toBeInTheDocument();

		await press('Upload it');

		expect(onUpload).toHaveBeenCalledWith(picked, 'pitch invoice spring 2026');
	});

	// The same sentence a picked file gets, for the same reason. A drop is not a
	// second way in with checks of its own.
	it('checks a dropped file the way it checks a picked one', async () => {
		list([], true);

		await dropFile(file('season.zip', 'application/zip', 1000), screen.getByText('Nothing here yet.'));

		expect(screen.getByText('A receipt has to be a PDF, a JPEG or a PNG.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Upload it' })).toBeDisabled();
	});

	it('ignores a file dropped by somebody who cannot add one', async () => {
		list([receipt()]);

		await dropFile(file('kvitto.pdf', 'application/pdf', 1000), screen.getByText('Pitch invoice, spring 2026'));

		expect(screen.queryByLabelText('Receipt file')).not.toBeInTheDocument();
	});

	// Dragging a selection across the page is not somebody trying to file a
	// receipt, and the area should not light up or open anything for it.
	it('leaves a drag that is carrying no file alone', async () => {
		list([], true);

		await dropFile(null, screen.getByText('Nothing here yet.'));

		expect(screen.queryByLabelText('Receipt file')).not.toBeInTheDocument();
	});
});
