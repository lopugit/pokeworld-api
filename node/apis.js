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

const transactions = {
	current: undefined,
}

const transactionOptions = {
	readPreference: 'primary',
	readConcern: { level: 'local' },
	writeConcern: { w: 'majority' },
}

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
		const session = client.startSession();

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

		const blocks = {}
		const blockCache = {}

		await generateLogicalBlocks(block, blocks, blockCache)

		const lockId = uuidv4()

		// get existing tiles
		const tileCache = {}

		const dbTiles = blocks.middle.tiles || []

		for (const tile of dbTiles) {
			tileCache[`${tile.mapX},${tile.mapY}`] = tile
		}

		let generationRequired = false

		if (dbTiles.length < (16 * 16) || regenerate) {
			generationRequired = true
			console.log('Generation required for block', blocks.middle.x, blocks.middle.y)
			// wait for write lock on blocks
			await new Promise(async resolve => {
				const blockWriteLockInterval = setInterval(async () => {
					if (!transactions.current) {
						transactions.current = true
						await session.withTransaction(async () => {
							const dbBlocks = await blockDb.find({
								$or: Object.values(blocks).map(block => ({ x: block.x, y: block.y })),
							}).toArray()
							const writeable = dbBlocks.every(block => !block.lockId || (Date.now() - block.lockDate > 1000 * 60))
							if (writeable) {
								clearInterval(blockWriteLockInterval)
								const proms = []
								const lockDate = Date.now()
								for (const block of Object.values(blocks)) {
									block.lockId = lockId
									block.lockDate = lockDate
									delete block.tiles
									proms.push(
										blockDb.findOneAndUpdate({
											x: block.x,
											y: block.y,
										}, {
											$set: {
												...block,
											},
										}, {
											upsert: true,
										}),
									)
								}

								await Promise.all(proms)
								resolve()
							}
						}, transactionOptions)
						transactions.current = false
					}
				}, 100)
			})

			await generateLogicalBlocks(block, blocks, blockCache)

			for (const block of Object.values(blocks)) {
				for (const tile of block.tiles || []) {
					tileCache[`${tile.mapX},${tile.mapY}`] = tile
				}
			}

			await generateBlock(blocks, regenerate, skipTilesExtraction, tileCache)
		}

		const saveProms = []

		const tiles = Object.values(tileCache)

		if (generationRequired) {

			const saveStartTime = Date.now()

			if (Object.values(blocks).some(block => block.needsSaving)) {
				console.log('Saving blocks', Date.now())
			}

			for (const block of Object.values(blocks)) {
				delete block.needsSaving
				delete block.needsSprites
				const tilesToSave = tiles.filter(tile => tile.blockX === block.x && tile.blockY === block.y)
				if (tilesToSave.length === 256) {
					block.tiles = tilesToSave
				}

				saveProms.push(
					blockDb.findOneAndUpdate({
						x: block.x,
						y: block.y,
					}, {
						$set: {
							...block,
						},
						$unset: {
							needsSaving: '',
							needsSprites: '',
						},
					}, {
						upsert: true,
					}),
				)
			}

			const saveAndUnlockInterval = setInterval(async () => {
				if (!transactions.current) {
					transactions.current = true
					clearInterval(saveAndUnlockInterval)
					await session.withTransaction(async () => {
						await Promise.all(saveProms)
						const saveEndTime = Date.now()
						console.log('Took', (saveEndTime - saveStartTime) / 1000, 's to save')
						try {
							const dbBlocks = await blockDb.find({
								$or: Object.values(blocks).map(block => ({ x: block.x, y: block.y })),
							}).toArray()
							const writeable = dbBlocks.every(block => block.lockId === lockId || (Date.now() - block.lockDate > 1000 * 60))
							if (writeable) {
								const proms = []
								const lockDate = Date.now()
								for (const block of Object.values(blocks)) {
									block.lockId = lockId
									block.lockDate = lockDate
									proms.push(
										blockDb.findOneAndUpdate({
											x: block.x,
											y: block.y,
										}, {
											$unset: {
												lockId: '',
												lockData: '',
											},
										}, {
											upsert: true,
										}),
									)
								}

								await Promise.all(proms)
							}
						} finally {
							// session.endSession()
							// client.close()
						}

					}, transactionOptions)
					transactions.current = false
				}
			}, 100)
		}

		return {
			send: {
				tiles,
				block: blocks.middle,
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

	const blockOffsets = [
		[0, 0, 'middle'],
		[0, 1, 'top'],
		[1, 0, 'right'],
		[-1, 0, 'left'],
		[0, -1, 'bottom'],
		[-1, 1, 'topLeft'],
		[1, 1, 'topRight'],
		[1, -1, 'bottomRight'],
		[-1, -1, 'bottomLeft'],
	]

	blockOffsets.forEach(offset => {
		blocks[offset[2]] = {
			...getLngFromBlock(block.x + offset[0], lngs),
			...getLatFromBlock(block.y - offset[1], lats),
		}
		blocks[offset[2]].mapX = blocks[offset[2]].x * 512
		blocks[offset[2]].mapY = blocks[offset[2]].y * 512
		blocks[offset[2]].uuid = uuidv4()
	})

	const proms = []
	for (const block of Object.values(blocks)) {
		proms.push(blockDb.findOne({
			x: block.x,
			y: block.y,
		}))
		blockCache[block.x + ',' + block.y] = block
	}

	const dbBlocks = await Promise.all(proms)

	Object.keys(blocks).forEach((key, i) => {
		if (dbBlocks[i]) {
			Object.assign(blocks[key], dbBlocks[i])
		}
	})

}

const generateBlock = async (blocks, regenerate, skipTilesExtraction, tileCache) => {

	// generate tiles
	console.log('Generating colour data for block', blocks.middle.x, blocks.middle.y)
	await generateBlockColourData(blocks.middle, skipTilesExtraction, false, tileCache)
	console.log('Generated colour data for block', blocks.middle.x, blocks.middle.y)

	// generate sprites
	await generateSpritesFor(blocks.middle, tileCache)

}

const generateBlockColourData = async (block, skipTilesExtraction, deleteOldTiles, tileCache) => {

	const tileDb = await client.db(process.env.MONGODB_DB).collection('tiles')

	const googleMap = await functions.getMapAt(block.lat, block.lng, 20)

	block.googleMap = googleMap.toString('base64')

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
		const updated = Date.now()
		for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
			for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
				tiles.push({
					blockX: block.x,
					blockY: block.y,
					x: offsetX,
					y: 15 - offsetY,
					uuid: uuidv4(),
					updated,
					needsSaving: true,
					mapX: (block.x * 512) + (offsetX * 32),
					mapY: (block.y * 512) + ((15 - offsetY) * 32),
					colourData: colourData[offsetX + ',' + offsetY],
				})
				stats.count++
			}
		}

		clearInterval(inter)

		for (const tile of tiles) {
			tileCache[tile.mapX + ',' + tile.mapY] = tile
			stats.count++
		}

	}

}

const getLngFromBlock = (blockX, lngs) => lngs.reduce((acc, tmpLng) => blockX > acc.x ? tmpLng : acc, { x: 0 })
const getLatFromBlock = (blockY, lats) => lats.reduce((acc, tmpLat) => blockY > acc.y ? tmpLat : acc, { y: 0 })
const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

const generateSpritesFor = async (block, tileCache) => {

	console.log('Generating sprites for block', block.x, block.y)

	await firstPass(block, tileCache)

	console.log('First pass complete for block', block.x, block.y)

	await secondPass(block, tileCache)

	console.log('Second pass complete for block', block.x, block.y)

}

const firstPass = async (block, tileCache) => {

	const colours = []

	const updated = Date.now()

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 18; offsetX++) {
		for (let offsetY = 0; offsetY < 18; offsetY++) {

			const realOffsetX = offsetX - 1
			const realOffsetY = offsetY - 1

			const tile = tileCache[(block.x * 512) + (realOffsetX * 32) + ',' + ((block.y * 512) + (realOffsetY * 32))]

			if (tile) {

				tile.updated = updated

				const topMiddle = tileCache[tile.mapX + ',' + (tile.mapY + 32)]

				const middleLeft = tileCache[(tile.mapX - 32) + ',' + tile.mapY]

				const middleRight = tileCache[(tile.mapX + 32) + ',' + tile.mapY]

				const bottomMiddle = tileCache[tile.mapX + ',' + (tile.mapY - 32)]

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

			}
		}
	}

}

const secondPass = async (block, tileCache) => {

	const colours = []

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 18; offsetX++) {
		for (let offsetY = 0; offsetY < 18; offsetY++) {

			const realOffsetX = offsetX - 1
			const realOffsetY = offsetY - 1

			const tile = tileCache[(block.x * 512) + (realOffsetX * 32) + ',' + ((block.y * 512) + (realOffsetY * 32))]

			if (tile) {

				const topLeft = tileCache[(tile.mapX - 32) + ',' + (tile.mapY + 32)]

				const topMiddle = tileCache[tile.mapX + ',' + (tile.mapY + 32)]

				const topRight = tileCache[(tile.mapX + 32) + ',' + (tile.mapY + 32)]

				const middleLeft = tileCache[(tile.mapX - 32) + ',' + tile.mapY]

				const middleRight = tileCache[(tile.mapX + 32) + ',' + tile.mapY]

				const bottomLeft = tileCache[(tile.mapX - 32) + ',' + (tile.mapY - 32)]

				const bottomMiddle = tileCache[tile.mapX + ',' + (tile.mapY - 32)]

				const bottomRight = tileCache[(tile.mapX + 32) + ',' + (tile.mapY - 32)]

				const grass = 'grass'
				const sand = 'sand-5'
				const tileColour = [grass, sand].includes(tile.img) ? tile.img : grass

				const debug = false

				if (debug) {
					if (!colours.includes(tileColour.replace(/-/g, ', '))) {
						colours.push(tileColour.replace(/-/g, ', '))
					}

					console.log(colours)
				}

				const topMiddleColour = topMiddle && [grass, sand].includes(topMiddle.img) ? topMiddle.img : grass
				const middleLeftColour = middleLeft && [grass, sand].includes(middleLeft.img) ? middleLeft.img : grass
				const middleRightColour = middleRight && [grass, sand].includes(middleRight.img) ? middleRight.img : grass
				const bottomMiddleColour = bottomMiddle && [grass, sand].includes(bottomMiddle.img) ? bottomMiddle.img : grass
				const topLeftColour = topLeft && [grass, sand].includes(topLeft.img) ? topLeft.img : grass
				const topRightColour = topRight && [grass, sand].includes(topRight.img) ? topRight.img : grass
				const bottomLeftColour = bottomLeft && [grass, sand].includes(bottomLeft.img) ? bottomLeft.img : grass
				const bottomRightColour = bottomRight && [grass, sand].includes(bottomRight.img) ? bottomRight.img : grass

				const topMiddleColour2 = topMiddle && [grass, sand].includes(topMiddle.img2) ? topMiddle.img2 : grass
				const middleLeftColour2 = middleLeft && [grass, sand].includes(middleLeft.img2) ? middleLeft.img2 : grass
				const middleRightColour2 = middleRight && [grass, sand].includes(middleRight.img2) ? middleRight.img2 : grass
				const bottomMiddleColour2 = bottomMiddle && [grass, sand].includes(bottomMiddle.img2) ? bottomMiddle.img2 : grass
				const topLeftColour2 = topLeft && [grass, sand].includes(topLeft.img2) ? topLeft.img2 : grass
				const topRightColour2 = topRight && [grass, sand].includes(topRight.img2) ? topRight.img2 : grass
				const bottomLeftColour2 = bottomLeft && [grass, sand].includes(bottomLeft.img2) ? bottomLeft.img2 : grass
				const bottomRightColour2 = bottomRight && [grass, sand].includes(bottomRight.img2) ? bottomRight.img2 : grass

				tile.needsSaving = true

				if (tileColour === grass) {
					if (
						topMiddleColour !== sand
						&& middleLeftColour !== sand
						&& middleRightColour !== sand
						&& bottomMiddleColour !== sand
						&& topLeftColour !== sand
						&& topRightColour !== sand
						&& bottomLeftColour !== sand
						&& bottomRightColour !== sand
					) {
						// maybe make grass
						let chance = Math.random()
						if (
							middleLeftColour === 'grass-2'
							&& bottomMiddleColour2 === 'grass-2'
							&& bottomLeftColour2 === 'grass-2'
						) {
							chance *= 1.8
						} else if (
							(middleLeftColour2 === 'grass-2' && bottomMiddleColour2 === 'grass-2')
							|| (middleLeftColour2 === 'grass-2' && bottomLeftColour2 === 'grass-2')
							|| (bottomMiddleColour2 === 'grass-2' && bottomLeftColour2 === 'grass-2')
						) {
							chance *= 1.65
						} else if (
							middleLeftColour2 === 'grass-2'
							|| bottomMiddleColour2 === 'grass-2'
						) {
							chance *= 1.35
						}

						if (chance > 0.65) {
							tile.img2 = 'grass-2'
						}
					}
				}

				if (tileColour === sand) {
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
				}

			}
		}
	}

}

module.exports = {
	v1Block,
	v1BlockLatLng,
	v1BatchBlocks,
}
