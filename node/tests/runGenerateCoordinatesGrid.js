require('dotenv').config()
const { generateCoordinatesGrid } = require('../functions.js')

const c = 1

switch (c) {
	case 1:
		generateCoordinatesGrid({
			write: false,
			mongodb: true
		})
		break
	default:
		break
}

