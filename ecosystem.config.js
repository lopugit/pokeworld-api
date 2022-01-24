module.exports = {
	apps: [{
		name: 'pokeworld-api',
		script: 'node/index.js',
		watch: '.',
		ignore_watch: ['./test1.png', './test2.png'],
	}],
};
