const functions = require('../functions')

const priority = 777

const baseTile = 'grass-2'
const revertTile = 'grass'
const spawnChance = 0.85

const grass = (state, block) => {
	const updated = Date.now()

	// turn tiles into sprites

	// first pass
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				const tilePriority = tile.priority || 0

				if ((!tile.grassGenerated && priority > tilePriority) || state.regenerate) {

					tile.priority = priority
					tile.updated = updated
					tile.grassGenerated = true
					tile.version = state.version

					const topLeftSprite = functions.getTileOffsetSprite(tile, [-1, 1], state.tiles.cache)
					const topMiddleSprite = functions.getTileOffsetSprite(tile, [0, 1], state.tiles.cache)
					const topRightSprite = functions.getTileOffsetSprite(tile, [1, 1], state.tiles.cache)
					const middleLeftSprite = functions.getTileOffsetSprite(tile, [-1, 0], state.tiles.cache)
					const middleRightSprite = functions.getTileOffsetSprite(tile, [1, 0], state.tiles.cache)
					const bottomLeftSprite = functions.getTileOffsetSprite(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite = functions.getTileOffsetSprite(tile, [0, -1], state.tiles.cache)
					const bottomRightSprite = functions.getTileOffsetSprite(tile, [1, -1], state.tiles.cache)

					// const topLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 1], state.tiles.cache)
					// const topMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, 1], state.tiles.cache)
					// const topRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 1], state.tiles.cache)
					const middleLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, 0], state.tiles.cache)
					// const middleRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache)
					const bottomLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache)
					// const bottomRightSprite2 = functions.getTileOffsetSprite2(tile, [1, -1], state.tiles.cache)

					const grass = revertTile
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

						const tileSprite = functions.getTileSprite(tile.mapX, tile.mapY, state.tiles.cache)

						tile.needsSaving = true

						if (tileSprite === grass) {
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
								// maybe make grass
								let chance = Math.random()
								if (
									middleLeftSprite2 === baseTile
									&& bottomMiddleSprite2 === baseTile
									&& bottomLeftSprite2 === baseTile
								) {
									chance += 0.2
								} else if (
									(middleLeftSprite2 === baseTile && bottomMiddleSprite2 === baseTile)
									|| (middleLeftSprite2 === baseTile && bottomLeftSprite2 === baseTile)
									|| (bottomMiddleSprite2 === baseTile && bottomLeftSprite2 === baseTile)
								) {
									chance += 0.1
								} else if (
									middleLeftSprite2 === baseTile
									|| bottomMiddleSprite2 === baseTile
								) {
									chance += 0.1
								}

								if (chance > spawnChance) {
									tile.img2 = baseTile
								}

							}
						}
					}
				}
			}
		}
	}

	// while pass
	// fill in grass
	// GXG -> GGG
	// delete straggler grass

	let changed = true
	let attempts = 0
	while (changed && attempts < 100) {
		attempts++
		changed = false
		for (let offsetX = 0; offsetX < 16; offsetX++) {
			for (let offsetY = 0; offsetY < 16; offsetY++) {
				let changed2 = false
				const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

				if (tile) {

					const tilePriority = tile.priority || 0

					if ((tile.grassGenerated && priority >= tilePriority) || state.regenerate) {

						tile.updated = updated
						tile.grassGenerated = true
						tile.version = state.version

						const topLeft = functions.getTileOffset(tile, [-1, 1], state.tiles.cache)
						const topMiddle = functions.getTileOffset(tile, [0, 1], state.tiles.cache)
						const topRight = functions.getTileOffset(tile, [1, 1], state.tiles.cache)
						const middleLeft = functions.getTileOffset(tile, [-1, 0], state.tiles.cache)
						const middleRight = functions.getTileOffset(tile, [1, 0], state.tiles.cache)
						const bottomLeft = functions.getTileOffset(tile, [-1, -1], state.tiles.cache)
						const bottomMiddle = functions.getTileOffset(tile, [0, -1], state.tiles.cache)
						const bottomRight = functions.getTileOffset(tile, [1, -1], state.tiles.cache)

						const topLeftSprite = functions.getTileSprite(topLeft?.mapX, topLeft?.mapY, state.tiles.cache)
						const topMiddleSprite = functions.getTileSprite(topMiddle?.mapX, topMiddle?.mapY, state.tiles.cache)
						const topRightSprite = functions.getTileSprite(topRight?.mapX, topRight?.mapY, state.tiles.cache)
						const middleLeftSprite = functions.getTileSprite(middleLeft?.mapX, middleLeft?.mapY, state.tiles.cache)
						const middleRightSprite = functions.getTileSprite(middleRight?.mapX, middleRight?.mapY, state.tiles.cache)
						const bottomLeftSprite = functions.getTileSprite(bottomLeft?.mapX, bottomLeft?.mapY, state.tiles.cache)
						const bottomMiddleSprite = functions.getTileSprite(bottomMiddle?.mapX, bottomMiddle?.mapY, state.tiles.cache)
						const bottomRightSprite = functions.getTileSprite(bottomRight?.mapX, bottomRight?.mapY, state.tiles.cache)

						const topLeftSprite2 = functions.getTileSprite2(topLeft?.mapX, topLeft?.mapY, state.tiles.cache)
						const topMiddleSprite2 = functions.getTileSprite2(topMiddle?.mapX, topMiddle?.mapY, state.tiles.cache)
						const topRightSprite2 = functions.getTileSprite2(topRight?.mapX, topRight?.mapY, state.tiles.cache)
						const middleLeftSprite2 = functions.getTileSprite2(middleLeft?.mapX, middleLeft?.mapY, state.tiles.cache)
						const middleRightSprite2 = functions.getTileSprite2(middleRight?.mapX, middleRight?.mapY, state.tiles.cache)
						const bottomLeftSprite2 = functions.getTileSprite2(bottomLeft?.mapX, bottomLeft?.mapY, state.tiles.cache)
						const bottomMiddleSprite2 = functions.getTileSprite2(bottomMiddle?.mapX, bottomMiddle?.mapY, state.tiles.cache)
						const bottomRightSprite2 = functions.getTileSprite2(bottomRight?.mapX, bottomRight?.mapY, state.tiles.cache)

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

						if (!changed2) {

							// Fill in grass
							// GGX -> GGG
							// XGG -> GGG
							if (
								tile.img2 === baseTile
								&& functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache) === baseTile
								&& functions.getTileOffsetSprite2(tile, [-1, -1], state.tiles.cache) === revertTile
								&& functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache) === revertTile
							) {
								const tile1 = functions.getTileOffset(tile, [-1, -1], state.tiles.cache)
								if (tile1) {
									tile1.img2 = baseTile
									tile1.loneGrass2TileNeighboursFilled = true
								}

								const tile2 = functions.getTileOffset(tile, [1, 0], state.tiles.cache)
								if (tile2) {
									tile2.img2 = baseTile
									tile2.loneGrass2TileNeighboursFilled = true
								}

								changed = true
								changed2 = true

							}
						}

						if (!changed2) {

							// Fill in grass
							// XGG -> GGG
							// GGX -> GGG
							if (
								tile.img2 === baseTile
								&& functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache) === baseTile
								&& functions.getTileOffsetSprite2(tile, [-1, 0], state.tiles.cache) === revertTile
								&& functions.getTileOffsetSprite2(tile, [1, 1], state.tiles.cache) === revertTile
							) {
								const tile1 = functions.getTileOffset(tile, [-1, 0], state.tiles.cache)
								if (tile1) {
									tile1.img2 = baseTile
									tile1.loneGrass2TileNeighboursFilled = true
								}

								const tile2 = functions.getTileOffset(tile, [1, 1], state.tiles.cache)
								if (tile2) {
									tile2.loneGrass2TileNeighboursFilled = true
									tile2.img2 = baseTile
								}

								changed = true
								changed2 = true

							}
						}

						if (tile.img2 === baseTile) {
							if (!changed2) {

								if (
									topRightSprite2 === baseTile
									&& bottomLeftSprite2 === baseTile
									&& topMiddleSprite2 !== baseTile
									&& topMiddleSprite2 === revertTile
									&& middleLeftSprite2 !== baseTile
									&& middleLeftSprite2 === revertTile
									&& topLeftSprite2 !== baseTile
									&& topLeftSprite2 === revertTile
								) {
									const topLeftTile = functions.getTileOffset(tile, [-1, 1], state.tiles.cache)
									const topMiddleTile = functions.getTileOffset(tile, [0, 1], state.tiles.cache)
									const middleLeftTile = functions.getTileOffset(tile, [-1, 0], state.tiles.cache)

									topLeftTile.img2 = baseTile
									middleLeftTile.img2 = baseTile
									topMiddleTile.img2 = baseTile
									topLeftTile.angleFilled = true
									middleLeftTile.angleFilled = true
									topMiddleTile.angleFilled = true
									changed = true
									changed2 = true
								} else if (
									topRightSprite2 === baseTile
									&& bottomLeftSprite2 === baseTile
									&& topMiddleSprite2 !== baseTile
									&& topMiddleSprite2 !== revertTile
									&& middleLeftSprite2 !== baseTile
									&& middleLeftSprite2 !== revertTile
									&& topLeftSprite2 !== baseTile
									&& topLeftSprite2 !== revertTile
								) {
									tile.img2 = revertTile
									tile.couldntFillAngledReverted = true
									changed = true
									changed2 = true
								}
							}

							if (!changed2) {

								if (
									topRightSprite2 === baseTile
									&& bottomLeftSprite2 === baseTile
									&& bottomMiddleSprite2 !== baseTile
									&& bottomMiddleSprite2 === revertTile
									&& middleRightSprite2 !== baseTile
									&& middleRightSprite2 === revertTile
									&& bottomRightSprite2 !== baseTile
									&& bottomRightSprite2 === revertTile
								) {
									const bottomMiddleTile = functions.getTileOffset(tile, [0, -1], state.tiles.cache)
									const middleRightTile = functions.getTileOffset(tile, [1, 0], state.tiles.cache)
									const bottomRightTile = functions.getTileOffset(tile, [1, -1], state.tiles.cache)

									bottomMiddleTile.img2 = baseTile
									middleRightTile.img2 = baseTile
									bottomRightTile.img2 = baseTile
									bottomMiddleTile.angleFilled = true
									middleRightTile.angleFilled = true
									bottomRightTile.angleFilled = true
									changed = true
									changed2 = true
								} else if (
									topRightSprite2 === baseTile
									&& bottomLeftSprite2 === baseTile
									&& bottomMiddleSprite2 !== baseTile
									&& bottomMiddleSprite2 !== revertTile
									&& middleRightSprite2 !== baseTile
									&& middleRightSprite2 !== revertTile
									&& bottomRightSprite2 !== baseTile
									&& bottomRightSprite2 !== revertTile
								) {
									tile.img2 = revertTile
									tile.couldntFillAngledReverted = true
									changed = true
									changed2 = true
								}
							}

							if (!changed2) {

								if (
									topLeftSprite2 === baseTile
									&& bottomRightSprite2 === baseTile
									&& bottomMiddleSprite2 !== baseTile
									&& bottomMiddleSprite2 === revertTile
									&& middleLeftSprite2 !== baseTile
									&& middleLeftSprite2 === revertTile
									&& bottomLeftSprite2 !== baseTile
									&& bottomLeftSprite2 === revertTile
								) {

									bottomMiddle.img2 = baseTile
									middleLeft.img2 = baseTile
									bottomLeft.img2 = baseTile
									bottomMiddle.angleFilled = true
									middleLeft.angleFilled = true
									bottomLeft.angleFilled = true
									changed = true
									changed2 = true
								} else if (
									topLeftSprite2 === baseTile
									&& bottomRightSprite2 === baseTile
									&& bottomMiddleSprite2 !== baseTile
									&& bottomMiddleSprite2 !== revertTile
									&& middleLeftSprite2 !== baseTile
									&& middleLeftSprite2 !== revertTile
									&& bottomLeftSprite2 !== baseTile
									&& bottomLeftSprite2 !== revertTile
								) {
									tile.img2 = revertTile
									tile.couldntFillAngledReverted = true
									changed = true
									changed2 = true
								}
							}

							if (!changed2) {
								if (
									topLeftSprite2 === baseTile
									&& bottomRightSprite2 === baseTile
									&& topMiddleSprite2 !== baseTile
									&& topMiddleSprite2 === revertTile
									&& middleRightSprite2 !== baseTile
									&& middleRightSprite2 === revertTile
									&& topRightSprite2 !== baseTile
									&& topRightSprite2 === revertTile
								) {
									topMiddle.img2 = baseTile
									middleRight.img2 = baseTile
									topRight.img2 = baseTile
									topMiddle.angleFilled = true
									middleRight.angleFilled = true
									topRight.angleFilled = true
									changed = true
									changed2 = true
								} else if (
									topLeftSprite2 === baseTile
									&& bottomRightSprite2 === baseTile
									&& topMiddleSprite2 !== baseTile
									&& topMiddleSprite2 !== revertTile
									&& middleRightSprite2 !== baseTile
									&& middleRightSprite2 !== revertTile
									&& topRightSprite2 !== baseTile
									&& topRightSprite2 !== revertTile
								) {
									tile.couldntFillAngledReverted = true
									tile.img2 = revertTile
									changed = true
									changed2 = true
								}
							}

						}

						if (!changed2 && Object.values(colours).includes(tile.img2)) {

							const invalidLongGrassSibling = [sand, path, road]

							const tileSprite = functions.getTileSprite(tile.mapX, tile.mapY, state.tiles.cache)

							tile.needsSaving = true

							if (tileSprite === grass) {
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
									// maybe make grass
									if (
										[topMiddleSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
										// [middleLeftSprite2, topMiddleSprite2].every(sprite => sprite === baseTile)
										// || [middleLeftSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
										|| [middleLeftSprite2, middleRightSprite2].every(sprite => sprite === baseTile)
										// || [middleRightSprite2, topMiddleSprite2].every(sprite => sprite === baseTile)
										// || [middleRightSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
									) {
										tile.img2 = baseTile
										tile.grassParallelFilled = true
										changed = true
										changed2 = true
									}

								}
							}

						}

						const tileSprite2 = functions.getTileSprite2(tile.mapX, tile.mapY, state.tiles.cache)

						if (
							!changed2
							&& tileSprite2 === baseTile
						) {
							if (
								(
									topMiddleSprite2 !== baseTile
									&& bottomMiddleSprite2 !== baseTile
								)
								|| (
									middleLeftSprite2 !== baseTile
									&& middleRightSprite2 !== baseTile
								)
							) {
								tile.revertedLoneGrass = true
								tile.img2 = revertTile
								changed = true
								changed2 = true
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
	run: grass,
}
