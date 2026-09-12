import { redirect } from 'next/navigation';

/**
 * The seasons list decides where to send people. It can't be done here because
 * picking a season needs the signed-in user, and this is a server component.
 *
 * Which makes this a 307 and a second request, and that is why nothing the app
 * controls points at it any more: `manifest.json` starts the installed app at
 * `/seasons` and its shortcut goes there too, so a cold launch asks for the
 * screen it wants rather than being told where to find it. What is left here is
 * every arrival the app doesn't own, a bookmark, a pasted link, somebody typing
 * the bare domain, and those still need somewhere to land.
 */
const HomePage = () => redirect('/seasons');

export default HomePage;
