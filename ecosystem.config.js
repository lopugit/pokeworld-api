module.exports = {
	apps: [
		{
			name: 'pokeworld-api',
			script: 'node/index.js',
			watch: ['.', './node'],
			autorestart: false,
			/* eslint-disable camelcase */
			ignore_watch: './db',
			/* eslint-enable camelcase */
			namespace: 'pokeworld',
		},
	],
};
