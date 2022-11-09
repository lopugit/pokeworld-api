const mods = require('../mods')
const functions = require('../functions')
require('dotenv').config()
const { MongoClient } = require('mongodb')
const fs = require('fs')

const latsMap = JSON.parse(fs.readFileSync('./assets/latsMap.json'))
const lngsMap = JSON.parse(fs.readFileSync('./assets/lngsMap.json'))
const latsDb = JSON.parse(fs.readFileSync('./assets/lats.json'))
const lngsDb = JSON.parse(fs.readFileSync('./assets/lngs.json'))

const url = `${process.env.MONGODB_SCHEME}${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_URL}/${process.env.MONGODB_DB}?retryWrites=true&w=majority${process.env.MONGODB_URL_PARAMS}`
console.log('Connecting to MongoDB')
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })

const { v4: uuidv4 } = require('uuid')

const transactions = {
	current: undefined,
}

const imageToRgbaMatrix = require('image-to-rgba-matrix');

const transactionOptions = {
	readPreference: 'primary',
	readConcern: { level: 'local' },
	writeConcern: { w: 'majority' },
}

const toExport = version => {

	const v1Block = async req => {

		console.log('v1Block getting block')

		const { lng, lat, regenerate, skipTilesExtraction, blockX, blockY } = req.query

		if (
			(typeof lng === 'number' && typeof lat === 'number')
			|| (typeof lng === 'string' && typeof lat === 'string')
			|| (typeof blockX === 'number' && typeof blockY === 'number')
			|| (typeof blockX === 'string' && typeof blockY === 'string')
		) {

			await client.connect()
			const session = client.startSession();

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

			if (
				dbTiles.length < (16 * 16)
				|| !dbTiles.every(tile => tile.version === version)
				|| regenerate
			) {
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
					}, 50)
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
				}, 50)
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

	const getLngFromBlock = (blockX, lngs) => lngs.reduce((acc, tmpLng) => blockX > acc.x ? tmpLng : acc, { x: 0 })
	const getLatFromBlock = (blockY, lats) => lats.reduce((acc, tmpLat) => blockY > acc.y ? tmpLat : acc, { y: 0 })
	const getLngFromLng = (lng, lngs) => lngs.reduce((acc, tmpLng) => lng > acc.lng ? tmpLng : acc, { lng: -180 })
	const getLatFromLat = (lat, lats) => lats.reduce((acc, tmpLat) => lat > acc.lat ? tmpLat : acc, { lat: -90 })

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
					tile.version = version

					const grass = '112,192,160'
					const sand = '216,200,128'
					const path = '159,208,191'
					const road = '215,224,232'

					const coloursArray = [grass, sand, path, road]

					const tileColour = functions.getTileOffsetColour(tile, [0, 0], tileCache, coloursArray)

					const debug = false

					if (debug) {
						if (tile?.colourData?.max === path) {
							console.log('Path tile', tile?.colourData?.max, tileColour)
						}

						if (!colours.includes(tile?.colourData?.max)) {
							colours.push(tile?.colourData?.max)
						}

					}

					const topMiddleColour = functions.getTileOffsetColour(tile, [0, 1], tileCache, coloursArray)
					const middleLeftColour = functions.getTileOffsetColour(tile, [-1, 0], tileCache, coloursArray)
					const middleRightColour = functions.getTileOffsetColour(tile, [1, 0], tileCache, coloursArray)
					const bottomMiddleColour = functions.getTileOffsetColour(tile, [0, -1], tileCache, coloursArray)

					const surroundedByNotSelfCount = [
						topMiddleColour,
						middleLeftColour,
						middleRightColour,
						bottomMiddleColour,
					].reduce((acc, colour) => coloursArray.filter(colour => colour !== tileColour).includes(colour) ? acc + 1 : acc, 0)

					const surroundedByNotSelf = surroundedByNotSelfCount >= 3

					tile.needsSaving = true

					if (
						tileColour === grass
					) {
						tile.img = 'grass'
					} else if (
						surroundedByNotSelf
						|| (topMiddleColour === grass && bottomMiddleColour === grass)
						|| (middleLeftColour === grass && middleRightColour === grass)
					) {
						tile.img = 'grass'
					} else if (tileColour === sand) {
						tile.img = 'sand-5'
					} else if (tileColour === path) {
						tile.img = 'path-5'
					} else if (tileColour === road) {
						tile.img = 'road-5'
					}

					tile.img2 = tile.img

				}
			}
		}

	}

	const secondPass = async (block, tileCache) => {

		// turn tiles into sprites
		for (let offsetX = 0; offsetX < 18; offsetX++) {
			for (let offsetY = 0; offsetY < 18; offsetY++) {

				const realOffsetX = offsetX - 1
				const realOffsetY = offsetY - 1

				const tile = tileCache[(block.x * 512) + (realOffsetX * 32) + ',' + ((block.y * 512) + (realOffsetY * 32))]

				if (tile) {

					const topLeftSprite = functions.getTileOffsetSprite(tile, [-1, 1], tileCache)
					const topMiddleSprite = functions.getTileOffsetSprite(tile, [0, 1], tileCache)
					const topRightSprite = functions.getTileOffsetSprite(tile, [1, 1], tileCache)
					const middleLeftSprite = functions.getTileOffsetSprite(tile, [-1, 0], tileCache)
					const middleRightSprite = functions.getTileOffsetSprite(tile, [1, 0], tileCache)
					const bottomLeftSprite = functions.getTileOffsetSprite(tile, [-1, -1], tileCache)
					const bottomMiddleSprite = functions.getTileOffsetSprite(tile, [0, -1], tileCache)
					const bottomRightSprite = functions.getTileOffsetSprite(tile, [1, -1], tileCache)

					const topLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 1], tileCache)
					const topMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, 1], tileCache)
					const topRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 1], tileCache)
					const middleLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 0], tileCache)
					// const middleRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 0], tileCache)
					const bottomLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, -1], tileCache)
					const bottomMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, -1], tileCache)
					const bottomRightSprite2 = functions.getTileOffsetSprite2(tile, [1, -1], tileCache)

					const grass = 'grass'
					const sand = 'sand-5'
					const path = 'path-5'
					const road = 'road-5'

					const colours = {
						grass,
						sand,
						path,
						road,
					}

					if (Object.values(colours).includes(tile.img2)) {

						const invalidLongGrassSibling = [sand, path, road]

						const tileColour = functions.getTileSprite(tile.mapX, tile.mapY, tileCache)

						tile.needsSaving = true

						if (tileColour === grass) {
							if (
								!invalidLongGrassSibling.includes(topMiddleSprite)
								&& !invalidLongGrassSibling.includes(middleLeftSprite)
								&& !invalidLongGrassSibling.includes(middleRightSprite)
								&& !invalidLongGrassSibling.includes(bottomMiddleSprite)
								&& !invalidLongGrassSibling.includes(topLeftSprite)
								&& !invalidLongGrassSibling.includes(topRightSprite)
								&& !invalidLongGrassSibling.includes(bottomLeftSprite)
								&& !invalidLongGrassSibling.includes(bottomRightSprite)
							) {
								let populated = false
								// maybe make grass
								let chance = Math.random()
								if (
									middleLeftSprite2 === 'grass-2'
									&& bottomMiddleSprite2 === 'grass-2'
									&& bottomLeftSprite2 === 'grass-2'
								) {
									chance *= 1.8
								} else if (
									(middleLeftSprite2 === 'grass-2' && bottomMiddleSprite2 === 'grass-2')
									|| (middleLeftSprite2 === 'grass-2' && bottomLeftSprite2 === 'grass-2')
									|| (bottomMiddleSprite2 === 'grass-2' && bottomLeftSprite2 === 'grass-2')
								) {
									chance *= 1.65
								} else if (
									middleLeftSprite2 === 'grass-2'
									|| bottomMiddleSprite2 === 'grass-2'
								) {
									chance *= 1.35
								}

								if (chance > 0.75) {
									tile.img2 = 'grass-2'
									populated = true
								}

								if (!populated) {
									// maybe spawn flower 1
									let flowerChance = Math.random()
									if (
										bottomLeftSprite2 === 'flower-1'
										|| bottomRightSprite2 === 'flower-1'
										|| topLeftSprite2 === 'flower-1'
										|| topRightSprite2 === 'flower-1'
									) {
										flowerChance *= 1.3
									}

									if (flowerChance > 0.99) {
										tile.img2 = 'flower-1'
										populated = true
									}
								}

								if (!populated) {
									// maybe spawn flower 2
									let flowerChance = Math.random()
									if (
										bottomMiddleSprite2 === 'flower-3'
									) {
										flowerChance *= 1.3
									}

									if (flowerChance > 0.99) {
										tile.img2 = 'flower-2'
										populated = true
									}
								}

								if (!populated) {
									// maybe spawn flower 2
									let flowerChance = Math.random()
									if (
										topMiddleSprite2 === 'flower-2'
									) {
										flowerChance *= 1.3
									}

									if (flowerChance > 0.99) {
										tile.img2 = 'flower-3'
										populated = true
									}
								}
							}
						}

						mods.tiles.patherizeTile(tile, tileCache, colours, 'path')
						mods.tiles.patherizeTile(tile, tileCache, colours, 'sand')
						mods.tiles.patherizeTile(tile, tileCache, colours, 'road')
					}

				}
			}
		}

	}

	return v1Block
}

module.exports = toExport
