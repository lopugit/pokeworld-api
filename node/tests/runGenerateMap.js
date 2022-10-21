require('dotenv').config()
const { generateMap } = require('../functions.js')

const c = 9

switch (c) {
	// small area in Australia using lngs and lats
	case 1:
		generateMap({
			latStart: -37.935769,
			lngStart: 145.028140,
			latEnd: -37.932652,
			lngEnd: 145.033826,
			json: true,
			html: true,
			images: true,
		})
		break
	// large area in Australia using lngs and lats
	case 2:
		generateMap({
			latStart: -37.945769,
			lngStart: 145.018140,
			latEnd: -37.922652,
			lngEnd: 145.043826,
			json: true,
			html: true,
			images: true,
		})
		break
	// small area in Australia using x and y
	case 3:
		generateMap({
			startX: 236678,
			endX: 236681,
			startY: 100747,
			endY: 100750,
			json: true,
			html: true,
			images: true,
		})
		break
	// large area in Australia using x and y
	case 4:
		generateMap({
			startX: 236670,
			endX: 236689,
			startY: 100738,
			endY: 100759,
			json: true,
			html: true,
			images: true,
		})
		break
	// small area in America using lngs and lats
	case 5:
		generateMap({
			latStart: 31.866124,
			lngStart: -102.363269,
			latEnd: 31.874179,
			lngEnd: -102.355324,
			json: true,
			html: true,
			images: true,
		})
		break
	// large area in America using lngs and lats
	case 6:
		generateMap({
			latStart: 31.856124,
			lngStart: -102.373269,
			latEnd: 31.874179,
			lngEnd: -102.355324,
			json: true,
			html: true,
			images: true,
		})
		break
	// large area in America using lngs and lats
	case 7:
		generateMap({
			latStart: -90,
			lngStart: -180,
			latEnd: 90,
			lngEnd: 180,
			json: false,
			html: false,
			images: false,
			mongodb: true,
		})
		break
	case 8:
		generateMap({
			latStart: -37.877592466481524,
			lngStart: 145.0015708922075,
			latEnd: -37.875253765715094,
			lngEnd: 145.0066361995029,
			json: true,
			html: true,
			images: true,
			mongodb: false,
		})
		break
	case 9:
		generateMap({
			latStart: -37.87585861877495,
			lngStart: 145.00549943855907,
			latEnd: -37.8755029312655,
			lngEnd: 145.0059446852365,
			json: true,
			html: true,
			images: true,
			mongodb: false,
		})
		break

	default:
		break
}

