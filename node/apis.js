const fs = require('fs')
const latsMap = JSON.parse(fs.readFileSync('./assets/latsMap.json'))
const lngsMap = JSON.parse(fs.readFileSync('./assets/lngsMap.json'))
const latsDb = JSON.parse(fs.readFileSync('./assets/lats.json'))
const lngsDb = JSON.parse(fs.readFileSync('./assets/lngs.json'))
const { get } = require('lodash')
const functions = require('./functions.js')
const { MongoClient } = require('mongodb')
const sharp = require('sharp')
const url = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_CLUSTER}.nhb33.mongodb.net/${process.env.MONGODB_DB}?retryWrites=true&w=majority`
console.log('Connecting to MongoDB')
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })
const imageToRgbaMatrix = require('image-to-rgba-matrix');

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

const v1Block = async req => {

	console.log('v1Block getting block')

	const { lng, lat, regenerate, skipTilesExtraction, blockX, blockY, deleteOldTiles } = req.query

	if (
		(typeof lng === 'number' && typeof lat === 'number')
		|| (typeof lng === 'string' && typeof lat === 'string')
		|| (typeof blockX === 'number' && typeof blockY === 'number')
		|| (typeof blockX === 'string' && typeof blockY === 'string')
	) {

		await client.connect()
		const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')

		const lngRounded = Math.floor(lng)
		const latRounded = Math.floor(lat)

		const lngs = blockX ? lngsDb : lngsMap[lngRounded]
		const lngFound = blockX ? getLngFromBlock(blockX, lngs) : getLngFromLng(lng, lngs)

		const lats = blockY ? latsDb : latsMap[latRounded]
		const latFound = blockY ? getLatFromBlock(blockY, lats) : getLatFromLat(lat, lats)

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

		await generateBlocks(block, regenerate, skipTilesExtraction, deleteOldTiles)

		const tiles = await tileDb.find({
			$and: [
				{
					$or: [{ blockX: block.x }, { blockX: block.x - 1 }, { blockX: block.x + 1 }],
				},
				{
					$or: [{ blockY: block.y }, { blockY: block.y - 1 }, { blockY: block.y + 1 }],
				},
			],
		}).toArray()

		console.log('v1Block done, returning')

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

const generateBlocks = async (block, regenerate, skipTilesExtraction) => {

	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	const lngs = lngsDb
	const lats = latsDb

	const blocks = [
		{
			...getLngFromBlock(block.x - 1, lngs),
			...getLatFromBlock(block.y + 1, lats),
		},
		{
			...getLngFromBlock(block.x, lngs),
			...getLatFromBlock(block.y + 1, lats),
		},
		{
			...getLngFromBlock(block.x + 1, lngs),
			...getLatFromBlock(block.y + 1, lats),
		},
		{
			...getLngFromBlock(block.x - 1, lngs),
			...getLatFromBlock(block.y, lats),
		},
		{
			...getLngFromBlock(block.x, lngs),
			...getLatFromBlock(block.y, lats),
		},
		{
			...getLngFromBlock(block.x + 1, lngs),
			...getLatFromBlock(block.y, lats),
		},
		{
			...getLngFromBlock(block.x - 1, lngs),
			...getLatFromBlock(block.y - 1, lats),
		},
		{
			...getLngFromBlock(block.x, lngs),
			...getLatFromBlock(block.y - 1, lats),
		},
		{
			...getLngFromBlock(block.x + 1, lngs),
			...getLatFromBlock(block.y - 1, lats),
		},
	]

	for (const block of blocks) {
		const dbBlock = await blockDb.findOne({ x: block.x, y: block.y })
		if (!dbBlock) {
			await blockDb.insertOne({
				...block,
				passes: 0,
			})
		} else if ((!dbBlock.passes && dbBlock.passes !== 0) || typeof dbBlock.passes !== 'number' || isNaN(dbBlock.passes)) {
			await blockDb.updateOne({
				x: block.x,
				y: block.y,
			}, {
				$set: {
					passes: 0,
				},
			})
		}
	}

	const proms = []

	for (const block of blocks) {
		proms.push(generateBlockTiles(block, regenerate, skipTilesExtraction))
	}

	await Promise.all(proms)

	const stats = {
		count: 0,
	}

	const inter2 = setInterval(() => {
		console.log('Generating block map', stats.count, 'of', blocks.length)
	}, 1000)

	for (const block of blocks) {
		stats.count++
		await generateBlockTileSprites(block, regenerate, 1)
	}

	clearInterval(inter2)
	stats.count = 0
	const inter3 = setInterval(() => {
		console.log('Regenerating block map', stats.count, 'of', blocks.length)
	}, 1000)

	for (const block of blocks) {
		stats.count++
		await generateBlockTileSprites(block, regenerate, 2)
	}

	clearInterval(inter3)

}

const generateBlockTiles = async (block, regenerate, skipTilesExtraction, deleteOldTiles) => {

	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	console.log('Generating block', block.x, block.y)

	// query mongodb for block
	const blockDbObject = await blockDb.findOne({
		x: block.x,
		y: block.y,
	})

	if (!blockDbObject.tilesGenerated || regenerate) {
		// handle if block doesn't exist
		await generateTilesFor(block, false, skipTilesExtraction, deleteOldTiles)

		blockDb.updateOne({
			x: block.x,
			y: block.y,
		}, {
			$set: {
				tilesGenerated: true,
				passes: 0,
			},
		})

	}

}

const generateBlockTileSprites = async (block, regenerate, passes = 1) => {

	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	console.log('Generating block', block.x, block.y)

	const blockDbObj = await blockDb.findOne({
		x: block.x,
		y: block.y,
	})

	if (blockDbObj.passes < passes || regenerate) {
		await generateMapFor(block)
		if (blockDbObj.passes < 2) {
			await blockDb.updateOne({
				x: block.x,
				y: block.y,
			}, {
				$set: {
					passes,
				},
			})
		}
	}

}

const getLngFromBlock = (blockX, lngs) => lngs.reduce((acc, tmpLng) => blockX > acc.x ? tmpLng : acc, { x: 0 })
const getLatFromBlock = (blockY, lats) => lats.reduce((acc, tmpLat) => blockY > acc.y ? tmpLat : acc, { y: 0 })
const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

const generateTilesFor = async (block, skipTilesExtraction, deleteOldTiles) => {
	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')
	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	const googleMap = await functions.getMapAt(block.lat, block.lng, 20)

	await blockDb.findOneAndUpdate(
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

	if (!skipTilesExtraction) {

		if (deleteOldTiles) {
			await tileDb.deleteMany({
				blockX: block.x,
				blockY: block.y,
			})
		}

		const stats = {
			count: 0,
			total: 512 / 32 * 512 / 32,
		}

		const inter = setInterval(() => {
			console.log('Processed', stats.count, 'out of', stats.total, 'tiles')
		}, 1000)

		const tiles = []
		for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
			for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
				const tile = await sharp(googleMap)
					.extract({ left: offsetX * 32, top: offsetY * 32, width: 32, height: 32 })
					.toBuffer()

				tiles.push({
					blockX: block.x,
					blockY: block.y,
					x: offsetX,
					y: 15 - offsetY,
					mapX: (block.x * 512) + (offsetX * 32),
					mapY: (block.y * 512) + ((15 - offsetY) * 32),
					image: tile,
					colourData: await colourData(tile),
				})
				stats.count++
			}
		}

		clearInterval(inter)

		stats.count = 0
		stats.total = tiles.length

		const inter2 = setInterval(() => {
			console.log('Inserting', stats.count, 'out of', stats.total, 'tiles')
		}, 1000)

		const proms = []

		for (const tile of tiles) {
			proms.push(
				tileDb.findOneAndUpdate({
					blockX: tile.blockX,
					blockY: tile.blockY,
					x: tile.x,
					y: tile.y,
				}, {
					$set: {
						...tile,
					},
					$unset: {
						qudrants: '',
						quadrants: '',
					},
				}, {
					upsert: true,
				}),
			)
			stats.count++
		}

		await Promise.all(proms)

		clearInterval(inter2)
	}

}

const generateMapFor = async block => {

	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')

	await firstPass(tileDb, block)

	await secondPass(tileDb, block)

}

const firstPass = async (tileDb, block) => {
	const tiles = await tileDb.find({
		blockX: block.x,
		blockY: block.y,
	}).toArray()

	const colours = []
	const tileSize = 16
	const proms1 = []
	// turn tiles into sprites
	const cache = {}
	for (const tile of tiles) {
		cache[tile.blockX + '_' + tile.blockY + '_' + tile.x + '_' + tile.y] = tile
	}

	for (const tile of tiles) {

		proms1.push(new Promise(async done => {
			const proms2 = []
			let tileToFind
			if (tile.x === 0 && tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: 0,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)

			} else if (tile.x === 0 && tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: 0,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1 && tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1 && tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tileSize - 1,
					y: 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: 30,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: tileSize - 1,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: tile.x,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			}

			const promsResults2 = await Promise.all(proms2)

			const topMiddle = promsResults2[0]
			const middleLeft = promsResults2[1]
			const middleRight = promsResults2[2]
			const bottomMiddle = promsResults2[3]

			const grass = '112-192-160'
			const sand = '216-200-128'
			const tileColour = [grass, sand].includes(tile.colourData.highest) ? tile.colourData.highest : grass

			const debug = false

			if (debug) {
				if (!colours.includes(tileColour.replace(/-/g, ', '))) {
					colours.push(tileColour.replace(/-/g, ', '))
				}

				console.log(colours)
			}

			const topMiddleColour = topMiddle && [grass, sand].includes(topMiddle.colourData.highest) ? topMiddle.colourData.highest : grass
			const middleLeftColour = middleLeft && [grass, sand].includes(middleLeft.colourData.highest) ? middleLeft.colourData.highest : grass
			const middleRightColour = middleRight && [grass, sand].includes(middleRight.colourData.highest) ? middleRight.colourData.highest : grass
			const bottomMiddleColour = bottomMiddle && [grass, sand].includes(bottomMiddle.colourData.highest) ? bottomMiddle.colourData.highest : grass

			const surroundedByGrass = [
				topMiddleColour,
				middleLeftColour,
				middleRightColour,
				bottomMiddleColour,
			].reduce((acc, colour) => colour === grass ? acc + 1 : acc) >= 3

			if (
				tileColour === grass
			) {
				tile.img = 'grass'
			} else if (
				surroundedByGrass
				|| (topMiddleColour === grass && bottomMiddleColour === grass)
				|| (middleLeftColour === grass && middleRightColour === grass)
			) {
				tile.img = 'grass'
			} else if (
				tileColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === grass
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-1'
			} else if (
				tileColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-2'
			} else if (
				tileColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-3'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === grass
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-4'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-5'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === sand
			) {
				tile.img = 'sand-6'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === grass
				&& middleRightColour === sand
				&& bottomMiddleColour === grass
			) {
				tile.img = 'sand-7'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === grass
			) {
				tile.img = 'sand-8'
			} else if (
				tileColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === grass
			) {
				tile.img = 'sand-9'
			}

			await tileDb.updateOne({
				_id: tile._id,
			}, {
				$set: tile,
			})
			done()

		}))

	}

	await Promise.all(proms1)
}

const secondPass = async (tileDb, block) => {
	const tiles = await tileDb.find({
		blockX: block.x,
		blockY: block.y,
	}).toArray()

	const colours = []
	const tileSize = 16
	// turn tiles into sprites

	const proms1 = []

	const cache = {}

	for (const tile of tiles) {
		cache[tile.blockX + '_' + tile.blockY + '_' + tile.x + '_' + tile.y] = tile
	}

	for (const tile of tiles) {
		proms1.push(new Promise(async done => {
			const proms2 = []
			let tileToFind
			if (tile.x === 0 && tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: 0,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)

			} else if (tile.x === 0 && tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: 0,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1 && tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1 && tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tileSize - 1,
					y: 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: 30,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: tileSize - 1,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x - 1,
					blockY: block.y,
					x: tileSize - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.y === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y + 1,
					x: tile.x,
					y: 0,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.x === tileSize - 1) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x + 1,
					blockY: block.y,
					x: 0,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else if (tile.y === 0) {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y - 1,
					x: tile.x,
					y: tileSize - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			} else {
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y + 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x - 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x + 1,
					y: tile.y,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
				tileToFind = {
					blockX: block.x,
					blockY: block.y,
					x: tile.x,
					y: tile.y - 1,
				}
				proms2.push(
					cache[tileToFind.blockX + '_' + tileToFind.blockY + '_' + tileToFind.x + '_' + tileToFind.y]
					|| tileDb.findOne(
						tileToFind,
					),
				)
			}

			const promsResults2 = await Promise.all(proms2)

			const topMiddle = promsResults2[0]
			const middleLeft = promsResults2[1]
			const middleRight = promsResults2[2]
			const bottomMiddle = promsResults2[3]

			const grass = 'grass'
			const sands = ['sand-1', 'sand-2', 'sand-3', 'sand-4', 'sand-5', 'sand-6', 'sand-7', 'sand-8', 'sand-9']
			const tileColour = [grass, ...sands].includes(tile.img) ? tile.img : grass

			const debug = false

			if (debug) {
				if (!colours.includes(tileColour.replace(/-/g, ', '))) {
					colours.push(tileColour.replace(/-/g, ', '))
				}

				console.log(colours)
			}

			const topMiddleColour = topMiddle && [grass, ...sands].includes(topMiddle.img) ? topMiddle.img : grass
			const middleLeftColour = middleLeft && [grass, ...sands].includes(middleLeft.img) ? middleLeft.img : grass
			const middleRightColour = middleRight && [grass, ...sands].includes(middleRight.img) ? middleRight.img : grass
			const bottomMiddleColour = bottomMiddle && [grass, ...sands].includes(bottomMiddle.img) ? bottomMiddle.img : grass

			const prevImg = tile.img

			if (
				tileColour === 'sand-2'
				&& middleLeftColour === 'grass'
			) {
				tile.img = 'sand-1'
			} else if (
				tileColour === 'sand-8'
				&& middleRightColour === 'grass'
			) {
				tile.img = 'sand-9'
			} else if (
				tileColour === 'sand-2'
				&& middleRightColour === 'grass'
			) {
				tile.img = 'sand-3'
			} else if (
				tileColour === 'sand-8'
				&& middleLeftColour === 'grass'
			) {
				tile.img = 'sand-7'
			}

			if (prevImg !== tile.img) {
				await tileDb.updateOne({
					_id: tile._id,
				}, {
					$set: tile,
				})
			}

			done()
		}))

	}

	await Promise.all(proms1)
}

const colourData = async quadrant => {
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
	v1BlockLatLng,
}
