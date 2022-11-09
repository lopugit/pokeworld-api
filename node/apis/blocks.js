const mods = require('../mods')
const functions = require('../functions')
require('dotenv').config()
const { MongoClient } = require('mongodb')
const fs = require('fs')

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

	const v1Blocks = async req => {

		console.log('v1Blocks getting block')

		const { offsets, blockX, blockY, regenerate } = req.query

		if (
			(
				(typeof blockX === 'number' && typeof blockY === 'number')
				|| (typeof blockX === 'string' && typeof blockY === 'string')
			) && offsets instanceof Array
		) {

			await client.connect()
			const session = client.startSession();

			const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

			const state = {
				blocks: {
					all: [],
					outer: [],
					edges: [],
					generate: [],
					cache: {},
				},
				tiles: {
					all: [],
					outer: [],
					edges: [],
					generate: [],
					cache: {},
				},
				regenerate: Boolean(regenerate === true || regenerate === 'true'),
				offsets,
				blockX,
				blockY,
				version,
				lockId: uuidv4(),
				session,
				blockDb,
				lats: latsDb,
				lngs: lngsDb,
			}

			await initBlocks(state)

			if (
				state.blocks.generate.some(block => block.regenerate)
			) {

				console.log('Generation required for', state.blocks.generate.length, 'blocks originating at', state.blockX, state.blockY)

				// wait for write lock on blocks
				await blockWriteLock(state)

				await syncBlocks(state)

				scanBlocks(state)

				if (
					state.blocks.generate.some(block => block.regenerate)
				) {
					// generate blocks that need generating
					await generateBlocks(state)

					// generate edge blocks that need regenerating
					await regenerateEdgeBlocks(state)

					// regenerate blocks to join to edges
					await regenerateBlocks(state)

					// save all blocks
					await saveAllBlocks(state)

					// unlock all blocks
					await blockWriteUnlock(state)

				}

			}

			return {
				send: {
					blocks: [...state.blocks.generate, ...state.blocks.edges],
				},
				status: 200,
			}

		}

		return {
			send: 'Latitude or Longitude is not a number',
			status: 400,
		}

	}

	const initBlocks = async state => {
		populateBlocks(state)

		await syncBlocks(state)

		scanBlocks(state)

	}

	const populateBlocks = state => {
		for (const offsetRaw of state.offsets) {

			const offset = typeof offsetRaw === 'string' ? JSON.parse(offsetRaw) : offsetRaw
			const newBlock = {
				x: Number(state.blockX) + offset[0],
				y: Number(state.blockY) + offset[1],
			}
			state.blocks.all.push(newBlock)
			state.blocks.generate.push(newBlock)
		}

		const offsets = [
			[1, 0],
			[0, 1],
			[-1, 0],
			[0, -1],
			[1, 1],
			[-1, 1],
			[-1, -1],
			[1, -1],
		]
		// get edges of generate blocks
		for (const block of state.blocks.generate) {
			for (const offset of offsets) {
				if (!state.blocks.all.find(b => b.x === block.x + offset[0] && b.y === block.y + offset[1])) {
					const newBlockX = Number(block.x) + offset[0]
					const newBlockY = Number(block.y) + offset[1]
					const newBlock = {
						...getLngFromBlock(newBlockX, state.lngs),
						...getLatFromBlock(newBlockY, state.lats),
						x: newBlockX,
						y: newBlockY,

					}
					state.blocks.all.push(newBlock)
					state.blocks.edges.push(newBlock)
				}
			}
		}

		// get outer edges of edges
		for (const block of state.blocks.edges) {
			for (const offset of offsets) {
				if (!state.blocks.all.find(b => b.x === block.x + offset[0] && b.y === block.y + offset[1])) {
					const newBlock = {
						x: Number(block.x) + offset[0],
						y: Number(block.y) + offset[1],
					}
					state.blocks.all.push(newBlock)
					state.blocks.outer.push(newBlock)
				}
			}
		}

		for (const block of state.blocks.all) {
			state.blocks.cache[block.x + ',' + block.y] = block
		}

	}

	const syncBlocks = async state => {
		const blockDb = await client.db(process.env.MONGODB_DB).collection('blocks')

		const proms = []
		for (const block of state.blocks.all) {
			proms.push(blockDb.findOne({
				x: block.x,
				y: block.y,
			}))
		}

		const dbBlocks = await Promise.all(proms)

		state.blocks.all.forEach((block, i) => {
			if (dbBlocks[i]) {
				Object.assign(block, dbBlocks[i])
			}
		})

	}

	const scanBlocks = async state => {
		for (const block of state.blocks.generate) {
			if (!block?.tiles || block?.tiles?.length < (16 * 16) || state.regenerate || block.tiles.some(tile => tile.version !== state.version)) {
				block.regenerate = true
				const offsets = [
					[1, 0],
					[0, 1],
					[-1, 0],
					[0, -1],
					[1, 1],
					[-1, 1],
					[-1, -1],
					[1, -1],
				]

				const edgeBlocks = offsets.map(offset => ({ x: block.x + offset[0], y: block.y + offset[1] }))
				state.blocks.all.forEach(potentialEdgeBlock => {

					if (
						edgeBlocks.find(edgeBlock => potentialEdgeBlock.x === edgeBlock.x && potentialEdgeBlock.y === edgeBlock.y)
						&& potentialEdgeBlock?.tiles?.length
					) {
						potentialEdgeBlock.regenerate = true
					}

				})
			}
		}

		for (const block of state.blocks.all) {
			for (const tile of block?.tiles || []) {
				state.tiles.cache[tile.mapX + ',' + tile.mapY] = tile
			}
		}
	}

	const blockWriteUnlock = async state => {
		await new Promise(async resolve => {
			const saveAndUnlockInterval = setInterval(async () => {
				if (!transactions.current) {
					transactions.current = true
					clearInterval(saveAndUnlockInterval)
					await state.session.withTransaction(async () => {
						try {
							const dbBlocks = await state.blockDb.find({
								$or: state.blocks.all.map(block => ({ x: block.x, y: block.y })),
							}).toArray()
							const dateNow = Date.now()
							const writeable = dbBlocks.every(block => block.lockId === state.lockId || (dateNow - block.lockDate > 1000 * 60))
							if (writeable) {
								const proms = []
								for (const block of state.blocks.all) {
									proms.push(
										state.blockDb.findOneAndUpdate({
											x: block.x,
											y: block.y,
										}, {
											$set: {
												lockId: null,
												lockDate: null,
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
					resolve()
				}
			}, 50)
		})

	}

	const blockWriteLock = async state => {

		await new Promise(async resolve => {
			const blockWriteLockInterval = setInterval(async () => {
				if (!transactions.current) {
					transactions.current = true
					await state.session.withTransaction(async () => {
						const dbBlocks = await state.blockDb.find({
							$or: state.blocks.all.map(block => ({ x: block.x, y: block.y })),
						}).toArray()
						const writeable = dbBlocks.every(block => !block.lockId || (Date.now() - block.lockDate > 1000 * 60))
						if (writeable) {
							clearInterval(blockWriteLockInterval)
							const proms = []
							const lockDate = Date.now()
							for (const block of state.blocks.all) {
								block.lockId = state.lockId
								block.lockDate = lockDate
								delete block.tiles
								proms.push(
									state.blockDb.findOneAndUpdate({
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

	}

	const saveAllBlocks = async state => {
		const blocks = [...state.blocks.generate, ...state.blocks.edges]
		const saveStartTime = Date.now()

		const proms = []
		for (const block of blocks) {
			if (block.regenerate) {
				block.needsSaving = false
				block.needsSprites = false
				block.regenerate = false
				const prom = state.blockDb.findOneAndUpdate({
					x: block.x,
					y: block.y,
				}, {
					$set: {
						...block,
					},
				}, {
					upsert: true,
				})

				proms.push(prom)
			}
		}

		await Promise.all(proms)

		const saveEndTime = Date.now()

		console.log('Took', (saveEndTime - saveStartTime) / 1000, 's to save')

	}

	const generateBlocks = async state => {
		const proms = []
		for (const block of state.blocks.generate) {
			if (block.regenerate) {
				const prom = generateBlock(state, block)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const regenerateEdgeBlocks = async state => {
		const proms = []
		for (const block of state.blocks.edges) {
			if (block.regenerate) {
				// we pass skipColourData as true because we are only regenerating edges which have had tiles generated previously
				const prom = generateBlock(state, block, true)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const regenerateBlocks = async state => {
		const proms = []
		for (const block of state.blocks.generate) {
			if (block.regenerate) {
				// we pass skipColourData as true because we already generated the colour data in the first stage
				const prom = generateBlock(state, block, true)
				proms.push(prom)
			}
		}

		await Promise.all(proms)
	}

	const generateBlock = async (state, block, skipColourData) => {

		if (!skipColourData) {
			// generate tiles
			console.log('Generating colour data for block', block.x, block.y)
			await generateBlockColourData(state, block)
			console.log('generate colour data for block', block.x, block.y)
		}

		// generate sprites
		await generateSpritesFor(state, block)

	}

	const generateSpritesFor = async (state, block) => {

		console.log('Generating sprites for block', block.x, block.y)

		await firstPass(state, block)

		console.log('First pass complete for block', block.x, block.y)

		await secondPass(state, block)

		console.log('Second pass complete for block', block.x, block.y)

	}

	const firstPass = async (state, block) => {

		const colours = []

		const updated = Date.now()

		// turn tiles into sprites
		for (let offsetX = 0; offsetX < 16; offsetX++) {
			for (let offsetY = 0; offsetY < 16; offsetY++) {

				const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

				if (tile) {

					tile.updated = updated
					tile.version = state.version

					const grass = '112,192,160'
					const sand = '216,200,128'
					const path = '159,208,191'
					const road = '215,224,232'

					const coloursArray = [grass, sand, path, road]

					const tileColour = functions.getTileOffsetColour(tile, [0, 0], state.tiles.cache, coloursArray)

					const debug = false

					if (debug) {
						if (tile?.colourData?.max === path) {
							console.log('Path tile', tile?.colourData?.max, tileColour)
						}

						if (!colours.includes(tile?.colourData?.max)) {
							colours.push(tile?.colourData?.max)
						}

					}

					const topMiddleColour = functions.getTileOffsetColour(tile, [0, 1], state.tiles.cache, coloursArray)
					const middleLeftColour = functions.getTileOffsetColour(tile, [-1, 0], state.tiles.cache, coloursArray)
					const middleRightColour = functions.getTileOffsetColour(tile, [1, 0], state.tiles.cache, coloursArray)
					const bottomMiddleColour = functions.getTileOffsetColour(tile, [0, -1], state.tiles.cache, coloursArray)

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

	const secondPass = async (state, block) => {

		// turn tiles into sprites
		for (let offsetX = 0; offsetX < 16; offsetX++) {
			for (let offsetY = 0; offsetY < 16; offsetY++) {

				const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

				if (tile) {

					tile.version = state.version

					const topLeftSprite = functions.getTileOffsetSprite(tile, [-1, 1], state.tiles.cache)
					const topMiddleSprite = functions.getTileOffsetSprite(tile, [0, 1], state.tiles.cache)
					const topRightSprite = functions.getTileOffsetSprite(tile, [1, 1], state.tiles.cache)
					const middleLeftSprite = functions.getTileOffsetSprite(tile, [-1, 0], state.tiles.cache)
					const middleRightSprite = functions.getTileOffsetSprite(tile, [1, 0], state.tiles.cache)
					const bottomLeftSprite = functions.getTileOffsetSprite(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite = functions.getTileOffsetSprite(tile, [0, -1], state.tiles.cache)
					const bottomRightSprite = functions.getTileOffsetSprite(tile, [1, -1], state.tiles.cache)

					const topLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 1], state.tiles.cache)
					const topMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, 1], state.tiles.cache)
					const topRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 1], state.tiles.cache)
					const middleLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 0], state.tiles.cache)
					// const middleRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache)
					const bottomLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache)
					const bottomRightSprite2 = functions.getTileOffsetSprite2(tile, [1, -1], state.tiles.cache)

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

						const tileColour = functions.getTileSprite(tile.mapX, tile.mapY, state.tiles.cache)

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

						mods.tiles.patherizeTile(tile, state.tiles.cache, colours, 'path')
						mods.tiles.patherizeTile(tile, state.tiles.cache, colours, 'sand')
						mods.tiles.patherizeTile(tile, state.tiles.cache, colours, 'road')
					}

				}
			}
		}

	}

	const generateBlockColourData = async (state, block) => {

		const googleMap = await functions.getMapAt(block.lat, block.lng, 20)

		block.googleMap = googleMap.toString('base64')

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

		block.tiles = []

		const updated = Date.now()
		for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
			for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
				const tile = {
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
				}
				block.tiles.push(tile)
				stats.count++
				state.tiles.cache[tile.mapX + ',' + tile.mapY] = tile
			}
		}

		clearInterval(inter)

	}

	const getLngFromBlock = (blockX, lngs) => lngs.reduce((acc, tmpLng) => blockX > acc.x ? tmpLng : acc, { x: 0 })
	const getLatFromBlock = (blockY, lats) => lats.reduce((acc, tmpLat) => blockY > acc.y ? tmpLat : acc, { y: 0 })

	return v1Blocks
}

module.exports = toExport
