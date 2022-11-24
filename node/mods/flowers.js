const functions = require('../functions')

const priority = 999
const spawnChance1 = 0.9999
const spawnChance2 = 0.99

const flowers = (state, block) => {
	const updated = Date.now()

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				const tilePriority = tile.priority || 0

				if ((!tile.foilageGenerated && priority > tilePriority) || state.regenerate) {

					tile.updated = updated
					tile.foilageGenerated = true
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
					// const middleLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 0], state.tiles.cache)
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
								if (!populated) {
									// maybe spawn flower 1
									let flowerChance = Math.random()
									if (
										bottomLeftSprite2 === 'flower-1'
										|| bottomRightSprite2 === 'flower-1'
										|| topLeftSprite2 === 'flower-1'
										|| topRightSprite2 === 'flower-1'
									) {
										flowerChance += 0.3
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
										flowerChance += 0.3
									}

									if (flowerChance > spawnChance2) {
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
										flowerChance += 0.3
									}

									if (flowerChance > spawnChance1) {
										tile.img2 = 'flower-3'
										populated = true
									}
								}
							}
						}

					}
				}
			}
		}
	}

}

module.exports = {
	priority,
	run: flowers,
}
