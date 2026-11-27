import { render, screen } from '@testing-library/react';
import Storylines from './Storylines';

describe('Storylines', () => {
	it('tells each storyline', () => {
		render(
			<Storylines
				storylines={[
					{ kind: 'winRun', uid: 'ana', count: 3 },
					{ kind: 'debut', uid: 'rui' },
				]}
				nameOf={uid => (uid === 'ana' ? 'Ana' : 'Rui')}
			/>
		);

		expect(screen.getByText('Ana has won 3 in a row')).toBeInTheDocument();
		expect(screen.getByText('First game for Rui')).toBeInTheDocument();
	});

	it('draws nothing without a storyline', () => {
		const { container } = render(<Storylines storylines={[]} nameOf={() => ''} />);

		expect(container).toBeEmptyDOMElement();
	});
});
