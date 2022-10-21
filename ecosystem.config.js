module.exports = {
	apps: [
		{
			name: 'pokeworld-api',
			script: 'node/index.js',
			watch: '.',
			/* eslint-disable camelcase */
			ignore_watch: './db',
			/* eslint-enable camelcase */
			namespace: 'pokeworld',
		},
	],
};
