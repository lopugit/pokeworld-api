require('dotenv').config()
const { generateCoordinatesGrid } = require('../functions.js')

const c = 1;
(async () => {
	switch (c) {
		case 1:
			await generateCoordinatesGrid({
				write: true,
				mongodb: false,
			})
			break
		default:
			break
	}
})()

