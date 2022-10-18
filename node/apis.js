const fs = require('fs')
const latsMap = JSON.parse(fs.readFileSync('./assets/latsMap.json'))
const lngsMap = JSON.parse(fs.readFileSync('./assets/lngsMap.json'))
const { get } = require('lodash')
const functions = require('./functions.js')
const { MongoClient } = require('mongodb')
const sharp = require('sharp')
const url = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_CLUSTER}.nhb33.mongodb.net/${process.env.MONGODB_DB}?retryWrites=true&w=majority`
console.log('Connecting to MongoDB with url', url)
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })
const imageToRgbaMatrix = require('image-to-rgba-matrix');

const v1Block = async req => {

	const { lng, lat, regenerate } = req.query

	if (typeof lng === 'number' && typeof lat === 'number') {

		await client.connect()
		const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')
		const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

		const lngRounded = Math.floor(lng)
		const latRounded = Math.floor(lat)

		const lngs = lngsMap[lngRounded]
		const lngFound = lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })

		const lats = latsMap[latRounded]
		const latFound = lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

		const block = {
			...lngFound,
			...latFound,
		}

		// query mongodb for map
		let blockDbObject = await blockDb.findOne({
			x: block.x,
			y: block.y,
		})

		if (blockDbObject) {
			// handle if map exists
		} else {
			// handle if map doesn't exist
			// generate google maps base map
			generateMapFor(block, false)

		}

		blockDbObject = blockDbObject || await blockDb.findOne({
			x: block.x,
			y: block.y,
		})

		if (blockDbObject && regenerate) {
			generateMapFor(block, true)
		}

		const tiles = await tileDb.find({
			blockX: block.x,
			blockY: block.y,
		}).toArray()

		return {
			send: {
				tiles,
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

const generateMapFor = async (block, exists) => {

	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')
	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	const googleMap = await functions.getMapAt(block.lat, block.lng, 19)

	fs.writeFileSync('test.png', googleMap)
	if (exists) {
		const res = await blockDb.findOneAndUpdate(
			{
				x: block.x,
				y: block.y,
			},
			{
				$set: {
					...block,
					googleMap,
				},
			})
		console.log(res)
	} else {
		const res = await blockDb.insertOne({
			...block,
			googleMap,
		})
		console.log(res)
	}

	const tiles = []
	for (let offsetX = 0; offsetX < 1024 / 32; offsetX++) {
		for (let offsetY = 0; offsetY < 1024 / 32; offsetY++) {
			const q1 = await sharp(googleMap)
				.extract({ left: offsetX * 32, top: offsetY * 32, width: 16, height: 16 })
				.toBuffer()
			const q2 = await sharp(googleMap)
				.extract({ left: (offsetX * 32) + 16, top: offsetY * 32, width: 16, height: 16 })
				.toBuffer()
			const q3 = await sharp(googleMap)
				.extract({ left: offsetX * 32, top: (offsetY * 32) + 16, width: 16, height: 16 })
				.toBuffer()
			const q4 = await sharp(googleMap)
				.extract({ left: (offsetX * 32) + 16, top: (offsetY * 32) + 16, width: 16, height: 16 })
				.toBuffer()

			tiles.push({
				blockX: block.x,
				blockY: block.y,
				x: offsetX,
				y: offsetY,
				qudrants: {
					q1: {
						image: q1,
						colourData: await quadrantColourData(q1),
					},
					q2: {
						image: q2,
						colourData: await quadrantColourData(q2),
					},
					q3: {
						image: q3,
						colourData: await quadrantColourData(q3),
					},
					q4: {
						image: q4,
						colourData: await quadrantColourData(q4),
					},
				},
			})
		}
	}

	for (const tile of tiles) {
		await tileDb.findOneAndUpdate({
			blockX: tile.blockX,
			blockY: tile.blockY,
			x: tile.x,
			y: tile.y,
		}, {
			$set: {
				...tile,
			},
		}, {
			upsert: true,
		})
	}

}

const quadrantColourData = async quadrant => {
	const map = {}
	const colours = await imageToRgbaMatrix(quadrant)
	colours.forEach(x => {
		x.forEach(y => {
			const key = `${y[0]}-${y[1]}-${y[2]}`
			map[key] = map[key] ? map[key] + 1 : 1
		})
	})

	const colourCount = Object.keys(map).map(key => ({ colour: key, count: map[key] }))

	colourCount.sort((a, b) => b.count - a.count)

	return {
		highest: colourCount[0]?.colour,
		colourCount,
	}

}

module.exports = {
	v1Block,
}
