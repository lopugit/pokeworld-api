module.exports = {
	apps: [
		{
			name: 'pokeworld-map-test',
			namespace: 'pokeworld',
			autorestart: false,
			script: 'node node/tests/runGenerateMap.js',
			watch: ['node/tests'],
		},
	],
}
