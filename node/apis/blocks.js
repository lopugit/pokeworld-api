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
				mods,
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

					state.regenerate = false

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
		await runMods(state, block)

	}

	const runMods = async (state, block) => {

		const startTime = Date.now()

		const sortedMods = [...state.mods].sort((a, b) => a.priority - b.priority)

		for (const mod of sortedMods) {
			mod.run(state, block)
		}

		const endTime = Date.now()

		console.log('Took', (endTime - startTime) / 1000, 's to run mods for block', block.x, block.y)

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
