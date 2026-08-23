import { redirect } from 'next/navigation';

/**
 * The seasons list decides where to send people. It can't be done here because
 * picking a season needs the signed-in user, and this is a server component.
 */
const HomePage = () => redirect('/seasons');

export default HomePage;
