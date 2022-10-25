const fs = require('fs')
const latsMap = JSON.parse(fs.readFileSync('./assets/latsMap.json'))
const lngsMap = JSON.parse(fs.readFileSync('./assets/lngsMap.json'))
const latsDb = JSON.parse(fs.readFileSync('./assets/lats.json'))
const lngsDb = JSON.parse(fs.readFileSync('./assets/lngs.json'))
const { get } = require('lodash')
const functions = require('./functions.js')
const { MongoClient } = require('mongodb')
const sharp = require('sharp')
const url = `${process.env.MONGODB_SCHEME}${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_URL}/${process.env.MONGODB_DB}?retryWrites=true&w=majority${process.env.MONGODB_URL_PARAMS}`
console.log('Connecting to MongoDB')
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })
const imageToRgbaMatrix = require('image-to-rgba-matrix');

const { v4: uuidv4 } = require('uuid')

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
		const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

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

		const blocks = []
		const blockCache = {}
		const tileCache = {}

		await generateLogicalBlocks(block, blocks, blockCache)

		const blockXs = blocks.map(block => block.x)
		const blockYs = blocks.map(block => block.y)

		const dbTilesTmp = await tileDb.find({
			$and: [
				{
					$or: blockXs.map(blockX => ({ blockX })),
				},
				{
					$or: blockYs.map(blockY => ({ blockY })),
				},
			],
		}).toArray()

		const tileBlocks = {}

		dbTilesTmp.forEach(tile => {
			tileBlocks[`${tile.blockX},${tile.blockY}`] = true
			tileCache[tile.mapX + ',' + tile.mapY] = tile
		})

		let done = false

		blocks.forEach(block => {
			if (!done && !tileBlocks[`${block.x},${block.y}`]) {
				done = true
				blocks.forEach(b => {
					b.needsTiles = true
				})
			}
		})

		const someNeedTiles = blocks.some(block => block.needsTiles)
		if (regenerate || someNeedTiles) {
			await checkBlocksWriteable(blocks)

			const dbTilesTmp = await tileDb.find({
				$and: [
					{
						$or: blockXs.map(blockX => ({ blockX })),
					},
					{
						$or: blockYs.map(blockY => ({ blockY })),
					},
				],
			}).toArray()

			const tileBlocks = {}

			dbTilesTmp.forEach(tile => {
				tileBlocks[`${tile.blockX},${tile.blockY}`] = true
				tileCache[tile.mapX + ',' + tile.mapY] = tile
			})

			let done = false

			blocks.forEach(block => {
				block.needsTiles = false
			})

			blocks.forEach(block => {
				if (!done && !tileBlocks[`${block.x},${block.y}`]) {
					done = true
					blocks.forEach(b => {
						b.needsTiles = true
					})
				}
			})

		}

		await generateBlocks(block, blocks, regenerate, skipTilesExtraction, tileCache)

		const tiles = []

		for (const tile of Object.values(tileCache)) {
			if (blockXs.includes(tile.blockX) && blockYs.includes(tile.blockY)) {
				tiles.push(tile)
			}
		}

		if (tiles.some(tile => tile.needsSaving)) {
			console.log('Saving tiles')
			for (const tile of tiles) {
				if (tile.needsSaving) {
					delete tile.needsSaving
					tileDb.findOneAndUpdate({
						mapX: tile.mapX,
						mapY: tile.mapY,
					}, {
						$set: {
							...tile,
						},
						$unset: {
							needsSaving: '',
						},
					}, {
						upsert: true,
					})
				}

				delete tile.x
				delete tile.y
				delete tile.blockX
				delete tile.blockY
				delete tile.colourData
				delete tile._id
			}
		}

		if (blocks.some(block => block.needsSaving)) {
			console.log('Saving blocks')
			for (const block of blocks) {
				if (block.needsSaving) {
					delete block.needsSaving
					delete block.needsTiles
					block.writeable = true
					blockDb.findOneAndUpdate({
						x: block.x,
						y: block.y,
					}, {
						$set: {
							...block,
						},
						$unset: {
							needsSaving: '',
							needsTiles: '',
						},
					}, {
						upsert: true,
					})
				}
			}
		}

		return {
			send: {
				tiles,
			},
			status: 200,
		}

	}

	return {
		send: 'Latitude or Longitude is not a number',
		status: 400,
	}

}

const generateLogicalBlocks = async (block, blocks, blockCache) => {
	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

	const lngs = lngsDb
	const lats = latsDb

	const resolution = 1

	const blockOffsets = [
		[0, 0],
		[0, 1],
		[1, 0],
		[-1, 0],
		[0, -1],
		[1, 1],
		[-1, -1],
		[1, -1],
		[-1, 1],
	]

	if (resolution >= 2) {
		blockOffsets.push(...[
			[2, 0],
			[0, 2],
			[-2, 0],
			[0, -2],
			[1, 2],
			[2, 1],
			[-1, -2],
			[-2, -1],
			[2, -1],
			[1, -2],
			[-2, 1],
			[-1, 2],
		])
	}

	blocks.push(
		...blockOffsets.map(offset => ({
			...getLngFromBlock(block.x + offset[0], lngs),
			...getLatFromBlock(block.y - offset[1], lats),
		})),
	)
	const proms = []
	for (const block of blocks) {
		proms.push(blockDb.findOne({
			x: block.x,
			y: block.y,
		}))
		blockCache[block.x + ',' + block.y] = block
	}

	const dbBlocks = await Promise.all(proms)

	dbBlocks.forEach((dbBlock, idx) => {
		if (dbBlock) {
			Object.assign(blocks[idx], dbBlock)
		}
	})

}

const checkBlocksWriteable = async blocks => {
	const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')
	return new Promise(async resolve => {
		const blockInterval = setInterval(async () => {
			console.log('Waiting for blocks', blocks[0].x, ',', blocks[0].y)
			for (const block of blocks) {
				const dbBlock = await blockDb.findOne({
					x: block.x,
					y: block.y,
				})
				block.dbBlock = dbBlock
				if (dbBlock && dbBlock.writeable) {
					block.writeable = true
				} else if (
					!dbBlock
					|| typeof dbBlock.writeable === 'undefined'
					|| (!dbBlock.lastWritten || Date.now() - dbBlock.lastWritten > (1000 * 20))
				) {
					block.writeable = true
				}
			}

			if (blocks.every(block => block.writeable)) {
				const proms = []
				for (const block of blocks) {
					proms.push(blockDb.findOneAndUpdate({
						x: block.x,
						y: block.y,
					}, {
						$set: {
							x: block.x,
							y: block.y,
							lastWritten: Date.now(),
							writeable: false,
						},
					}, {
						upsert: true,
					}),
					)
					block.writeable = false
					block.needsSaving = true
					Object.assign(block, block.dbBlock)
					delete block.dbBlock
				}

				await Promise.all(proms)

				clearInterval(blockInterval)
				resolve()
			}
		}, 1000)
	})
}

const generateBlocks = async (block, blocks, regenerate, skipTilesExtraction, tileCache) => {

	let minPasses = Infinity

	for (const block of blocks) {
		if (!block?.passes) {
			minPasses = 0
		} else if (block?.passes < minPasses) {
			minPasses = block?.passes
		}
	}

	const proms = []

	for (const block of blocks) {
		// maybe generate block tiles
		proms.push(maybeGenerateBlockTiles(block, block.needsTiles || regenerate, skipTilesExtraction, false, tileCache))
	}

	await Promise.all(proms)

	const stats = {
		count: 0,
	}

	const inter2 = setInterval(() => {
		console.log('Maybe generating block tile sprites', stats.count, 'of', blocks.length)
	}, 1000)

	const proms1 = []

	for (const block of blocks) {
		stats.count++
		proms1.push(maybeGenerateBlockTileSprites(block, minPasses < 1 || block.needsTiles || regenerate, tileCache, 1))
	}

	await Promise.all(proms1)

	clearInterval(inter2)

	stats.count = 0
	const inter3 = setInterval(() => {
		console.log('Maybe regenerating block tile sprites', stats.count, 'of', blocks.length)
	}, 1000)

	const proms2 = []

	for (const block of blocks) {
		stats.count++
		proms2.push(maybeGenerateBlockTileSprites(block, minPasses < 2 || block.needsTiles || regenerate, tileCache, 2))
	}

	await Promise.all(proms2)

	clearInterval(inter3)

}

const maybeGenerateBlockTiles = async (block, regenerate, skipTilesExtraction, deleteOldTiles, tileCache) => {

	if (!block.tilesGenerated || regenerate) {
		console.log('Generating block tile colour data', block.x, block.y)
		// handle if block doesn't exist
		await generateTilesFor(block, skipTilesExtraction, deleteOldTiles, tileCache)

	}

}

const generateTilesFor = async (block, skipTilesExtraction, deleteOldTiles, tileCache) => {
	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')

	const googleMap = await functions.getMapAt(block.lat, block.lng, 20)

	if (!skipTilesExtraction) {

		if (deleteOldTiles) {
			await tileDb.deleteMany({
				blockX: block.x,
				blockY: block.y,
			})
		}

		const colourDataRaw = await imageToRgbaMatrix(googleMap)

		const colourData = {}

		for (let idx = 0; idx < colourDataRaw.length; idx++) {
			const x = colourDataRaw[idx]
			for (let idy = 0; idy < x.length; idy++) {
				const y = x[idy]
				const tileX = Math.floor(idx / 32)
				const tileY = Math.floor(idy / 32)
				if (!colourData[tileY + ',' + tileX]) {
					colourData[tileY + ',' + tileX] = {}
				}

				colourData[tileY + ',' + tileX][y[0] + ',' + y[1] + ',' + y[2]] = colourData[tileY + ',' + tileX][y[0] + ',' + y[1] + ',' + y[2]] + 1 || 1
			}
		}

		const colourKeys = Object.keys(colourData)
		for (const key of colourKeys) {
			const colourCounts = colourData[key]
			const colours = Object.keys(colourCounts)
			let maxColour = null
			let maxCount = 0
			for (const colour of colours) {
				if (colourCounts[colour] > maxCount) {
					maxColour = colour
					maxCount = colourCounts[colour]
				}
			}

			colourCounts.max = maxColour
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
				tiles.push({
					blockX: block.x,
					blockY: block.y,
					x: offsetX,
					y: 15 - offsetY,
					uuid: uuidv4(),
					needsSaving: true,
					mapX: (block.x * 512) + (offsetX * 32),
					mapY: (block.y * 512) + ((15 - offsetY) * 32),
					colourData: colourData[offsetX + ',' + offsetY],
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

		// const proms = []

		for (const tile of tiles) {
			tileCache[tile.mapX + ',' + tile.mapY] = tile
			stats.count++
		}

		clearInterval(inter2)

		block.tilesGenerated = true
		block.needsSaving = true
	}

}

const maybeGenerateBlockTileSprites = async (block, regenerate, tileCache, passes = 1) => {

	if (!block?.passes || block.passes < passes || regenerate) {
		console.log('Generating block tile sprites', block.x, block.y)
		await generateTileSpritesFor(block, tileCache)
		if (!block.passes || block.passes < 2) {
			block.needsSaving = true
			block.passes = passes
		}
	} else {
		console.log('Block tile sprites already generated, pass:', passes)
	}

}

const getLngFromBlock = (blockX, lngs) => lngs.reduce((acc, tmpLng) => blockX > acc.x ? tmpLng : acc, { x: 0 })
const getLatFromBlock = (blockY, lats) => lats.reduce((acc, tmpLat) => blockY > acc.y ? tmpLat : acc, { y: 0 })
const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

const generateTileSpritesFor = async (block, tileCache) => {

	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')

	await firstPass(tileDb, block, tileCache)

	// await secondPass(tileDb, block, tileCache)

}

const firstPass = async (tileDb, block, tileCache) => {

	const colours = []

	const proms = []

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
		for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {

			proms.push(new Promise(async resolve => {

				const tile = tileCache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))] || await tileDb.findOne({
					mapX: (block.x * 512) + (offsetX * 32),
					mapY: (block.y * 512) + (offsetY * 32),
				}) || {}

				const topMiddle = tileCache[tile.mapX + ',' + (tile.mapY + 32)] || await tileDb.findOne({
					mapX: tile.mapX,
					mapY: tile.mapY + 32,
				})
				if (topMiddle) {
					tileCache[tile.mapX + ',' + (tile.mapY + 32)] = topMiddle
				}

				const middleLeft = tileCache[(tile.mapX - 32) + ',' + tile.mapY] || await tileDb.findOne({
					mapX: tile.mapX - 32,
					mapY: tile.mapY,
				})
				if (middleLeft) {
					tileCache[(tile.mapX - 32) + ',' + tile.mapY] = middleLeft
				}

				const middleRight = tileCache[(tile.mapX + 32) + ',' + tile.mapY] || await tileDb.findOne({
					mapX: tile.mapX + 32,
					mapY: tile.mapY,
				})
				if (middleRight) {
					tileCache[(tile.mapX + 32) + ',' + tile.mapY] = middleRight
				}

				const bottomMiddle = tileCache[tile.mapX + ',' + (tile.mapY - 32)] || await tileDb.findOne({
					mapX: tile.mapX,
					mapY: tile.mapY - 32,
				})
				if (bottomMiddle) {
					tileCache[tile.mapX + ',' + (tile.mapY - 32)] = bottomMiddle
				}

				const grass = '112,192,160'
				const sand = '216,200,128'
				const tileColour = [grass, sand].includes(tile?.colourData?.max) ? tile.colourData.max : grass

				const debug = false

				if (debug) {
					if (!colours.includes(tileColour.replace(/-/g, ', '))) {
						colours.push(tileColour.replace(/-/g, ', '))
					}

					console.log(colours)
				}

				const topMiddleColour = topMiddle && [grass, sand].includes(topMiddle?.colourData?.max) ? topMiddle.colourData.max : grass
				const middleLeftColour = middleLeft && [grass, sand].includes(middleLeft?.colourData?.max) ? middleLeft.colourData.max : grass
				const middleRightColour = middleRight && [grass, sand].includes(middleRight?.colourData?.max) ? middleRight.colourData.max : grass
				const bottomMiddleColour = bottomMiddle && [grass, sand].includes(bottomMiddle?.colourData?.max) ? bottomMiddle.colourData.max : grass

				const surroundedByGrass = [
					topMiddleColour,
					middleLeftColour,
					middleRightColour,
					bottomMiddleColour,
				].reduce((acc, colour) => colour === grass ? acc + 1 : acc) >= 3

				tile.needsSaving = true

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
				} else {
					tile.img = 'sand-5'
				}

				tile.img2 = tile.img

				if (
					tileColour === sand
					&& middleRightColour === sand
					&& bottomMiddleColour === sand
					&& topMiddleColour === grass
					&& middleLeftColour === grass
				) {
					tile.img2 = 'sand-1'
				} else if (
					tileColour === sand
					&& middleRightColour === sand
					&& bottomMiddleColour === sand
					&& topMiddleColour === grass
					&& middleLeftColour === sand
				) {
					tile.img2 = 'sand-2'
				} else if (
					tileColour === sand
					&& middleRightColour === grass
					&& bottomMiddleColour === sand
					&& topMiddleColour === grass
					&& middleLeftColour === sand
				) {
					tile.img2 = 'sand-3'
				} else if (
					tileColour === sand
					&& middleRightColour === sand
					&& bottomMiddleColour === sand
					&& topMiddleColour === sand
					&& middleLeftColour === grass
				) {
					tile.img2 = 'sand-4'
				} else if (
					tileColour === sand
					&& middleRightColour === grass
					&& bottomMiddleColour === sand
					&& topMiddleColour === sand
					&& middleLeftColour === sand
				) {
					tile.img2 = 'sand-6'
				} else if (
					tileColour === sand
					&& middleRightColour === sand
					&& bottomMiddleColour === grass
					&& topMiddleColour === sand
					&& middleLeftColour === grass
				) {
					tile.img2 = 'sand-7'
				} else if (
					tileColour === sand
					&& middleRightColour === sand
					&& bottomMiddleColour === grass
					&& topMiddleColour === sand
					&& middleLeftColour === sand
				) {
					tile.img2 = 'sand-8'
				} else if (
					tileColour === sand
					&& middleRightColour === grass
					&& bottomMiddleColour === grass
					&& topMiddleColour === sand
					&& middleLeftColour === sand
				) {
					tile.img2 = 'sand-9'
				}

				resolve()
			}))

		}
	}

	await Promise.all(proms)

}

const secondPass = async (tileDb, block, tileCache) => {

	const colours = []
	// turn tiles into sprites

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
		for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {

			const tile = tileCache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))] || await tileDb.findOne({
				mapX: (block.x * 512) + (offsetX * 32),
				mapY: (block.y * 512) + (offsetY * 32),
			}) || {}

			const topMiddle = tileCache[tile.mapX + ',' + (tile.mapY + 32)] || await tileDb.findOne({
				mapX: tile.mapX,
				mapY: tile.mapY + 32,
			})
			if (topMiddle) {
				tileCache[tile.mapX + ',' + (tile.mapY + 32)] = topMiddle
			}

			const middleLeft = tileCache[(tile.mapX - 32) + ',' + tile.mapY] || await tileDb.findOne({
				mapX: tile.mapX - 32,
				mapY: tile.mapY,
			})
			if (middleLeft) {
				tileCache[(tile.mapX - 32) + ',' + tile.mapY] = middleLeft
			}

			const middleRight = tileCache[(tile.mapX + 32) + ',' + tile.mapY] || await tileDb.findOne({
				mapX: tile.mapX + 32,
				mapY: tile.mapY,
			})
			if (middleRight) {
				tileCache[(tile.mapX + 32) + ',' + tile.mapY] = middleRight
			}

			const bottomMiddle = tileCache[tile.mapX + ',' + (tile.mapY - 32)] || await tileDb.findOne({
				mapX: tile.mapX,
				mapY: tile.mapY - 32,
			})
			if (bottomMiddle) {
				tileCache[tile.mapX + ',' + (tile.mapY - 32)] = bottomMiddle
			}

			const grass = 'grass'
			const sand = 'sand-5'
			const sands = ['sand-1', 'sand-2', 'sand-3', 'sand-4', 'sand-5', 'sand-6', 'sand-7', 'sand-8', 'sand-9']
			const tileColour = [grass, ...sands].includes(tile.img) ? tile.img : grass

			const debug = false

			if (debug) {
				if (!colours.includes(tileColour.replace(/-/g, ', '))) {
					colours.push(tileColour.replace(/-/g, ', '))
				}

				console.log(colours)
			}

			const topMiddleColour = topMiddle && [grass, ...sands].includes(topMiddle?.img) ? topMiddle.img : grass
			const middleLeftColour = middleLeft && [grass, ...sands].includes(middleLeft?.img) ? middleLeft.img : grass
			const middleRightColour = middleRight && [grass, ...sands].includes(middleRight?.img) ? middleRight.img : grass
			const bottomMiddleColour = bottomMiddle && [grass, ...sands].includes(bottomMiddle?.img) ? bottomMiddle.img : grass

			tile.needsSaving = true

			tile.img2 = tile.img

			if (
				tile.img === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === grass
			) {
				tile.img2 = 'sand-1'
			} else if (
				tile.img === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === sand
			) {
				tile.img2 = 'sand-2'
			} else if (
				tile.img === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === sand
				&& topMiddleColour === grass
				&& middleLeftColour === sand
			) {
				tile.img2 = 'sand-3'
			} else if (
				tile.img === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === grass
			) {
				tile.img2 = 'sand-4'
			} else if (
				tile.img === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === sand
				&& topMiddleColour === sand
				&& middleLeftColour === sand
			) {
				tile.img2 = 'sand-6'
			} else if (
				tile.img === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === grass
				&& topMiddleColour === sand
				&& middleLeftColour === grass
			) {
				tile.img2 = 'sand-7'
			} else if (
				tile.img === sand
				&& middleRightColour === sand
				&& bottomMiddleColour === grass
				&& topMiddleColour === sand
				&& middleLeftColour === sand
			) {
				tile.img2 = 'sand-8'
			} else if (
				tile.img === sand
				&& middleRightColour === grass
				&& bottomMiddleColour === grass
				&& topMiddleColour === sand
				&& middleLeftColour === sand
			) {
				tile.img2 = 'sand-9'
			}
		}

	}

}

module.exports = {
	v1Block,
	v1BlockLatLng,
}
