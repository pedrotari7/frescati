import { act, fireEvent, render, screen } from '@testing-library/react';
import RenameSheet from './RenameSheet';

const onRename = vi.fn();
const onClose = vi.fn();

// Headless UI settles its own transition state a microtask after mount, so an
// unflushed render logs an act warning from inside the library on every test.
const sheet = (name: string | null) => (
	<RenameSheet
		name={name}
		open={name !== null}
		blurb='Only what it is called.'
		placeholder='Match ball'
		maxLength={60}
		onClose={onClose}
		onRename={onRename}
	/>
);

const draw = async (name: string | null = 'Match ball') => {
	const view = render(sheet(name));
	await act(async () => {});

	return view;
};

const field = () => screen.getByLabelText('Name');
const save = () => screen.getByRole('button', { name: 'Save' });

describe('RenameSheet', () => {
	beforeEach(() => vi.clearAllMocks());

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

	// Nothing to write, and a write anyway would sign a change on somebody who
	// changed nothing.
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

	// Re-seeded on open, so the second name is never edited over the first one's.
	// Both callers are lists and this sheet is reused down them.
	it('re-seeds when something else is opened', async () => {
		const { rerender } = await draw();

		fireEvent.change(field(), { target: { value: 'Half typed' } });

		rerender(sheet('Blue vests'));

		expect(field()).toHaveValue('Blue vests');
	});
});
