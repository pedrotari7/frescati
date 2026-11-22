import { act, fireEvent, render, screen } from '@testing-library/react';
import SwishNumberField from './SwishNumberField';

const mockSave = vi.fn();
const mockClear = vi.fn();
let mockSaved: string | null = null;

vi.mock('../lib/db/payment', () => ({
	savePayment: (...args: unknown[]) => mockSave(...args),
	clearPayment: (...args: unknown[]) => mockClear(...args),
}));

vi.mock('../hooks/useData', () => ({ usePayment: () => mockSaved }));

vi.mock('../hooks/useWrite', () => ({
	useWrite: () => async (action: () => Promise<unknown>) => {
		await action();

		return true;
	},
}));

const field = () => screen.getByLabelText('Number');
const press = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

describe('SwishNumberField', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaved = null;
	});

	it('opens on the number already saved', () => {
		mockSaved = '0701234567';
		render(<SwishNumberField uid='anna' />);

		expect(field()).toHaveValue('0701234567');
	});

	it('saves the number trimmed', async () => {
		render(<SwishNumberField uid='anna' />);

		fireEvent.change(field(), { target: { value: '  0709998877 ' } });
		await press('Save');

		expect(mockSave).toHaveBeenCalledWith('anna', '0709998877');
		expect(mockClear).not.toHaveBeenCalled();
	});

	it('clears the number when the field is emptied', async () => {
		mockSaved = '0701234567';
		render(<SwishNumberField uid='anna' />);

		fireEvent.change(field(), { target: { value: '   ' } });
		await press('Clear number');

		expect(mockClear).toHaveBeenCalledWith('anna');
		expect(mockSave).not.toHaveBeenCalled();
	});

	it('has nothing to save until the number changes', () => {
		mockSaved = '0701234567';
		render(<SwishNumberField uid='anna' />);

		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('does not write a blank number when nothing is saved', () => {
		render(<SwishNumberField uid='anna' />);

		fireEvent.change(field(), { target: { value: '  ' } });

		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it("names whose number it is when an app admin edits somebody else's", async () => {
		render(<SwishNumberField uid='anna' ownerName='Anna' />);

		expect(screen.getByRole('heading', { name: "Anna's Swish number" })).toBeInTheDocument();

		fireEvent.change(field(), { target: { value: '0709998877' } });
		await press('Save');

		expect(mockSave).toHaveBeenCalledWith('anna', '0709998877');
	});

	it('says who sees the number', () => {
		render(<SwishNumberField uid='anna' />);

		expect(
			screen.getByText(/shown on any season that names you as its payee, where anybody in the app can see it/i)
		).toBeInTheDocument();
	});
});
