module.exports = {
	apps: [{
		name: 'pokeworld-api',
		script: 'node/index.js',
		watch: '.',
		/* eslint-disable camelcase */
		ignore_watch: './db',
		/* eslint-enable camelcase */
		namespace: 'pokeworld',
	}, {
		name: 'pokeworld-map-test',
		namespace: 'pokeworld',
		autorestart: false,
		script: 'node node/tests/runGenerateMap.js',
		watch: ['node/tests'],
	}],
};
