const version = '1.0.0013'

const fs = require('fs')
const latsMap = JSON.parse(fs.readFileSync('./assets/latsMap.json'))
const lngsMap = JSON.parse(fs.readFileSync('./assets/lngsMap.json'))
require('dotenv').config()

const v1BlockLatLng = async req => {

	console.log('v1BlockLatLng Getting block from lat lng')

	const { lng, lat } = req.query

	if (
		(typeof lng === 'number' && typeof lat === 'number')
		|| (typeof lng === 'string' && typeof lat === 'string')

	) {

		const lngRounded = Math.floor(lng)
		const latRounded = Math.floor(lat)

		const lngs = lngsMap[lngRounded]
		const lngFound = getLngFromLng(lng, lngs)

		const lats = latsMap[latRounded]
		const latFound = getLatFromLat(lat, lats)

		const block = {
			...lngFound,
			...latFound,
		}

		if (!block.x && !block.y) {
			return {
				status: 400,
				send: 'No block found',
			}
		}

		return {
			send: {
				block,
			},
			status: 200,
		}

	}

	return {
		send: 'Latitude or Longitude is not a number',
		status: 400,
	}

}

const v1Blocks = require('./apis/blocks.js')(version)

const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

module.exports = {
	v1Blocks,
	v1BlockLatLng,
}
