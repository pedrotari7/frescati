import { act, fireEvent, render, screen } from '@testing-library/react';
import type { KitItem } from '@shared/types';
import KitRenameSheet from './KitRenameSheet';

const item = (name: string): KitItem => ({
	id: 'ball-1',
	name,
	kind: 'ball',
	holderUid: 'anna',
	updatedBy: 'anna',
	updatedAt: '2026-08-01T00:00:00.000Z',
});

const onRename = jest.fn();
const onClose = jest.fn();

// Headless UI settles its own transition state a microtask after mount, so an
// unflushed render logs an act warning from inside the library on every test.
const draw = async (kit: KitItem | null = item('Match ball')) => {
	const view = render(<KitRenameSheet item={kit} open={!!kit} onClose={onClose} onRename={onRename} />);
	await act(async () => {});

	return view;
};

const field = () => screen.getByLabelText('Name');
const save = () => screen.getByRole('button', { name: 'Save' });

describe('KitRenameSheet', () => {
	beforeEach(() => jest.clearAllMocks());

	it('opens on the name it already has', async () => {
		await draw();

		expect(field()).toHaveValue('Match ball');
	});

	it('saves the new name and closes', async () => {
		await draw();

		fireEvent.change(field(), { target: { value: 'Spare ball' } });
		await act(async () => {
			fireEvent.click(save());
		});

		expect(onRename).toHaveBeenCalledWith('Spare ball');
		expect(onClose).toHaveBeenCalled();
	});

	// The register is read at the side of a pitch, so the keyboard's Go key is
	// the shortest route through a one-field sheet.
	it('saves on submit as well as on the button', async () => {
		await draw();

		fireEvent.change(field(), { target: { value: 'Spare ball' } });
		await act(async () => {
			fireEvent.submit(field().closest('form') as HTMLFormElement);
		});

		expect(onRename).toHaveBeenCalledWith('Spare ball');
	});

	it('trims what it saves', async () => {
		await draw();

		fireEvent.change(field(), { target: { value: '  Spare ball  ' } });
		await act(async () => {
			fireEvent.click(save());
		});

		expect(onRename).toHaveBeenCalledWith('Spare ball');
	});

	// A blank name is refused by the rules, so offering a Save that fails is
	// worse than not offering one.
	it('refuses a name that is blank or only spaces', async () => {
		await draw();

		fireEvent.change(field(), { target: { value: '   ' } });

		expect(save()).toBeDisabled();
	});

	// Nothing to write, and a write anyway would sign the item over to somebody
	// who changed nothing about it.
	it('refuses a name that has not changed, before or after trimming', async () => {
		await draw();

		expect(save()).toBeDisabled();

		fireEvent.change(field(), { target: { value: '  Match ball  ' } });

		expect(save()).toBeDisabled();
	});

	it('leaves without saving on Cancel', async () => {
		await draw();

		fireEvent.change(field(), { target: { value: 'Spare ball' } });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});

		expect(onRename).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	// Re-seeded on open, so the second item's name is never edited over the
	// first one's — the register is a list and this sheet is reused down it.
	it('re-seeds when a different item is opened', async () => {
		const { rerender } = await draw();

		fireEvent.change(field(), { target: { value: 'Half typed' } });

		rerender(<KitRenameSheet item={item('Blue vests')} open onClose={onClose} onRename={onRename} />);

		expect(field()).toHaveValue('Blue vests');
	});
});
