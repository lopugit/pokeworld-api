const functions = require('../functions')

const priority = 778

const baseTile = 'pond-5'
const revertTile = 'grass'
const spawnChance = 0.98
const spreadChance = 0.8

const ponds = (state, block) => {
	const updated = Date.now()

	// turn tiles into sprites

	// first pass
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				const tilePriority = tile.priority || 0

				if ((!tile.pondGenerated && priority > tilePriority) || state.regenerate) {

					tile.priority = priority
					tile.updated = updated
					tile.pondGenerated = true
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
									chance += spreadChance
								} else if (
									(middleLeftSprite2 === baseTile && bottomMiddleSprite2 === baseTile)
									|| (middleLeftSprite2 === baseTile && bottomLeftSprite2 === baseTile)
									|| (bottomMiddleSprite2 === baseTile && bottomLeftSprite2 === baseTile)
								) {
									chance += spreadChance
								} else if (
									middleLeftSprite2 === baseTile
									|| bottomMiddleSprite2 === baseTile
								) {
									chance += spreadChance
								}

								if (chance > spawnChance) {
									tile.img = baseTile
									tile.img2 = baseTile
								}

							}
						}

					}
				}
			}
		}
	}

	let changed = true
	let attempts = 0
	while (changed && attempts < 100) {
		changed = false
		attempts++
		// second pass fill in ponds
		for (let offsetX = 0; offsetX < 16; offsetX++) {
			for (let offsetY = 0; offsetY < 16; offsetY++) {

				const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

				if (tile) {

					const tilePriority = tile.priority || 0

					if ((tile.pondGenerated && priority >= tilePriority) || state.regenerate) {

						tile.updated = updated
						tile.pondGenerated = true
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
						const middleRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache)
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

						if (tile.img2 === baseTile) {
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

								topLeftTile.img = baseTile
								topLeftTile.img2 = baseTile
								middleLeftTile.img = baseTile
								middleLeftTile.img2 = baseTile
								topMiddleTile.img = baseTile
								topMiddleTile.img2 = baseTile
								changed = true
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
								tile.img = revertTile
								tile.img2 = revertTile
								tile.revertedPond = true
								changed = true
							}

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

								bottomMiddleTile.img = baseTile
								bottomMiddleTile.img2 = baseTile
								middleRightTile.img = baseTile
								middleRightTile.img2 = baseTile
								bottomRightTile.img = baseTile
								bottomRightTile.img2 = baseTile

								changed = true

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
								tile.img = revertTile
								tile.img2 = revertTile
								tile.revertedPond = true
								changed = true
							}
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
									if (
										[topMiddleSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
										// [middleLeftSprite2, topMiddleSprite2].every(sprite => sprite === baseTile)
										// || [middleLeftSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
										|| [middleLeftSprite2, middleRightSprite2].every(sprite => sprite === baseTile)
										// || [middleRightSprite2, topMiddleSprite2].every(sprite => sprite === baseTile)
										// || [middleRightSprite2, bottomMiddleSprite2].every(sprite => sprite === baseTile)
									) {
										tile.img = baseTile
										tile.img2 = baseTile
										changed = true
									}

								}
							}

						}

						if (
							tile.img2 === baseTile
							&& functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache) === baseTile
							&& functions.getTileOffsetSprite2(tile, [-1, -1], state.tiles.cache) === revertTile
							&& functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache) === revertTile
						) {
							const tile1 = functions.getTileOffset(tile, [-1, -1], state.tiles.cache)
							if (tile1) {
								tile1.img = baseTile
								tile1.img2 = baseTile
								tile1.lonePondTileNeighboursFilled = true
							}

							const tile2 = functions.getTileOffset(tile, [1, 0], state.tiles.cache)
							if (tile2) {
								tile2.img = baseTile
								tile2.img2 = baseTile
								tile2.lonePondTileNeighboursFilled = true
							}

							changed = true

						}

						if (
							tile.img2 === baseTile
							&& functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache) === baseTile
							&& functions.getTileOffsetSprite2(tile, [-1, 0], state.tiles.cache) === revertTile
							&& functions.getTileOffsetSprite2(tile, [1, 1], state.tiles.cache) === revertTile
						) {
							const tile1 = functions.getTileOffset(tile, [-1, 0], state.tiles.cache)
							if (tile1) {
								tile1.img = baseTile
								tile1.img2 = baseTile
								tile1.loneTileNeighboursFilled = true
							}

							const tile2 = functions.getTileOffset(tile, [1, 1], state.tiles.cache)
							if (tile2) {
								tile2.img = baseTile
								tile2.img2 = baseTile
								tile2.loneTileNeighboursFilled = true
							}

							changed = true

						}

						const tileSprite = functions.getTileSprite(tile.mapX, tile.mapY, state.tiles.cache)

						if (
							tileSprite === baseTile
						) {
							if (
								(
									topMiddleSprite !== baseTile
									&& bottomMiddleSprite !== baseTile
								)
								|| (
									middleLeftSprite !== baseTile
									&& middleRightSprite !== baseTile
								)
							) {
								tile.img = revertTile
								tile.img2 = revertTile
								tile.revertedLonePond = true
								changed = true
							}
						}
					}
				}
			}
		}
	}

	// patherize
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				const tilePriority = tile.priority || 0

				if ((tile.pondGenerated && priority >= tilePriority) || state.regenerate) {

					tile.updated = updated
					tile.pondGenerated = true
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
					const middleRightSprite2 = functions.getTileOffsetSprite2(tile, [1, 0], state.tiles.cache)
					const bottomLeftSprite2 = functions.getTileOffsetSprite2(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite2 = functions.getTileOffsetSprite2(tile, [0, -1], state.tiles.cache)
					const bottomRightSprite2 = functions.getTileOffsetSprite2(tile, [1, -1], state.tiles.cache)

					const grass = 'grass'
					const longGrass = 'grass-2'
					const sand = 'sand-5'
					const grassPath = 'path-5'
					const road = 'road-5'
					const flower1 = 'flower-1'
					const flower2 = 'flower-2'
					const path = 'pond'
					const validGrassSiblings = [
						grass,
						flower1,
						flower2,
						longGrass,
						sand,
						grassPath,
						road,
					]

					if (tile.img === baseTile) {
						if (
							validGrassSiblings.includes(middleRightSprite2)
							&& topMiddleSprite === (path + '-5')
							&& topRightSprite === (path + '-5')
							&& bottomMiddleSprite === (path + '-5')
						) {
							tile.img2 = path + '-10'
						} else if (
							validGrassSiblings.includes(middleLeftSprite2)
							&& topMiddleSprite === (path + '-5')
							&& topLeftSprite === (path + '-5')
							&& bottomMiddleSprite === (path + '-5')
						) {
							tile.img2 = path + '-11'
						} else if (
							middleRightSprite === (path + '-5')
							&& bottomMiddleSprite === (path + '-5')
							&& validGrassSiblings.includes(topMiddleSprite2)
							&& validGrassSiblings.includes(middleLeftSprite2)
						) {
							tile.img2 = path + '-1'
						} else if (
							middleRightSprite === (path + '-5')
							&& bottomMiddleSprite === (path + '-5')
							&& validGrassSiblings.includes(topMiddleSprite2)
							&& middleLeftSprite === (path + '-5')
						) {
							tile.img2 = path + '-2'
						} else if (
							validGrassSiblings.includes(middleRightSprite2)
							&& bottomMiddleSprite === (path + '-5')
							&& validGrassSiblings.includes(topMiddleSprite2)
							&& middleLeftSprite === (path + '-5')
						) {
							tile.img2 = path + '-3'
						} else if (
							middleRightSprite === (path + '-5')
							&& bottomMiddleSprite === (path + '-5')
							&& topMiddleSprite === (path + '-5')
							&& validGrassSiblings.includes(middleLeftSprite2)
						) {
							tile.img2 = path + '-4'
						} else if (
							validGrassSiblings.includes(middleRightSprite2)
							&& bottomMiddleSprite === (path + '-5')
							&& topMiddleSprite === (path + '-5')
							&& middleLeftSprite === (path + '-5')
						) {
							tile.img2 = path + '-6'
						} else if (
							middleRightSprite === (path + '-5')
							&& validGrassSiblings.includes(bottomMiddleSprite2)
							&& topMiddleSprite === (path + '-5')
							&& validGrassSiblings.includes(middleLeftSprite2)
						) {
							tile.img2 = path + '-14'
						} else if (
							validGrassSiblings.includes(middleRightSprite2)
							&& validGrassSiblings.includes(bottomMiddleSprite2)
							&& topMiddleSprite === (path + '-5')
							&& middleLeftSprite === (path + '-5')
						) {
							tile.img2 = path + '-16'
						} else if (
							validGrassSiblings.includes(topLeftSprite2)
							&& topMiddleSprite === (path + '-5')
							&& middleLeftSprite === (path + '-5')
						) {
							tile.img2 = path + '-7'
						} else if (
							validGrassSiblings.includes(topRightSprite2)
							&& topMiddleSprite === (path + '-5')
							&& middleRightSprite === (path + '-5')
						) {
							tile.img2 = path + '-9'
						} else if (
							bottomMiddleSprite !== (path + '-5')
							&& middleLeftSprite === (path + '-5')
							&& middleRightSprite === (path + '-5')
						) {
							tile.img2 = path + '-15'
						} else {
							tile.img2 = path + '-5'
						}

					}
				}
			}
		}
	}
}

module.exports = {
	priority,
	run: ponds,
}
