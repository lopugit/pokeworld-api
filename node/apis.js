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

const v1BatchBlocks = async req => {

	console.log('v1BatchBlocks Getting blocks from lat/lng blockX/blockY')

	const { offsets, blockX, blockY, regenerate } = req.query

	if (
		(
			(typeof blockX === 'number' && typeof blockY === 'number')
			|| (typeof blockX === 'string' && typeof blockY === 'string')
		) && offsets instanceof Array
	) {

		const responses = []

		for (const offsetRaw of offsets) {
			const offset = JSON.parse(offsetRaw)
			const newReq = {
				query: {
					regenerate: Boolean(regenerate === true || regenerate === 'true'),
					blockX: Number(blockX) + offset[0],
					blockY: Number(blockY) + offset[1],
				},
			}
			responses.push(v1Block(newReq))
		}

		const resps = await Promise.all(responses)
		const tiles = []
		const blocks = []
		for (const resp of resps) {
			if (resp?.send?.tiles) {
				for (const tile of resp.send.tiles) {
					const index = tiles.findIndex(t => t.mapX === tile.mapX && t.mapY === tile.mapY)
					if (index === -1) {
						tiles.push(tile)
					} else if (index >= 0 && (tiles[index].updated < tile.updated || !tiles[index].updated)) {
						tiles[index] = tile
					}
				}
			}

			if (resp?.send?.block) {
				blocks.push(resp.send.block)
			}
		}

		return {
			send: {
				tiles,
				blocks,
			},
			status: 200,
		}
	}

	return {
		send: 'Block X or Block Y is not a number or offsets is not an array',
		status: 400,
	}

}

const v1Blocks = require('./apis/blocks.js')(version)

const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

module.exports = {
	v1Blocks,
	v1BlockLatLng,
	v1BatchBlocks,
}
