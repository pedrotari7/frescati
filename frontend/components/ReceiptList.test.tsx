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
