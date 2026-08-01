// Same rules as the repo root, plus Tailwind class sorting for JSX.
// The root file is `.prettierrc.json` rather than `.prettierrc` specifically so
// `require` can parse it — Node treats an extensionless file as JavaScript.
module.exports = {
	...require('../.prettierrc.json'),
	plugins: ['prettier-plugin-tailwindcss'],
};
