const functions = require('../functions')

const priority = 222

const patherize = (state, block) => {

	const updated = Date.now()

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				tile.version = state.version
				tile.updated = updated
				const grass = 'grass'
				const sand = 'sand-5'
				const grassPath = 'path-5'
				const road = 'road-5'

				const baseTiles = {
					grass,
					sand,
					grassPath,
					road,
				}

				if (Object.values(baseTiles).includes(tile.img)) {

					// const topLeftSprite = functions.getTileOffsetSprite(tile, [-1, 1], state.tiles.cache)
					const topMiddleSprite = functions.getTileOffsetSprite(tile, [0, 1], state.tiles.cache)
					// const topRightSprite = functions.getTileOffsetSprite(tile, [1, 1], state.tiles.cache)
					const middleLeftSprite = functions.getTileOffsetSprite(tile, [-1, 0], state.tiles.cache)
					const middleRightSprite = functions.getTileOffsetSprite(tile, [1, 0], state.tiles.cache)
					// const bottomLeftSprite = functions.getTileOffsetSprite(tile, [-1, -1], state.tiles.cache)
					const bottomMiddleSprite = functions.getTileOffsetSprite(tile, [0, -1], state.tiles.cache)
					// const bottomRightSprite = functions.getTileOffsetSprite(tile, [1, -1], state.tiles.cache)

					const tileSprite = functions.getTileSprite(tile.mapX, tile.mapY, state.tiles.cache)

					const paths = [
						'sand',
						'path',
						'road',
					]

					for (const path of paths) {

						const validGrassSiblings = [baseTiles.grass, baseTiles.sand, baseTiles.grassPath, baseTiles.road].filter(c => c !== (path + '-5'))

						if (tileSprite === (path + '-5')) {
							if (
								middleRightSprite === (path + '-5')
								&& bottomMiddleSprite === (path + '-5')
								&& validGrassSiblings.includes(topMiddleSprite)
								&& validGrassSiblings.includes(middleLeftSprite)
							) {
								tile.img2 = path + '-1'
							} else if (
								middleRightSprite === (path + '-5')
								&& bottomMiddleSprite === (path + '-5')
								&& validGrassSiblings.includes(topMiddleSprite)
								&& middleLeftSprite === (path + '-5')
							) {
								tile.img2 = path + '-2'
							} else if (
								validGrassSiblings.includes(middleRightSprite)
								&& bottomMiddleSprite === (path + '-5')
								&& validGrassSiblings.includes(topMiddleSprite)
								&& middleLeftSprite === (path + '-5')
							) {
								tile.img2 = path + '-3'
							} else if (
								middleRightSprite === (path + '-5')
								&& bottomMiddleSprite === (path + '-5')
								&& topMiddleSprite === (path + '-5')
								&& validGrassSiblings.includes(middleLeftSprite)
							) {
								tile.img2 = path + '-4'
							} else if (
								validGrassSiblings.includes(middleRightSprite)
								&& bottomMiddleSprite === (path + '-5')
								&& topMiddleSprite === (path + '-5')
								&& middleLeftSprite === (path + '-5')
							) {
								tile.img2 = path + '-6'
							} else if (
								middleRightSprite === (path + '-5')
								&& validGrassSiblings.includes(bottomMiddleSprite)
								&& topMiddleSprite === (path + '-5')
								&& validGrassSiblings.includes(middleLeftSprite)
							) {
								tile.img2 = path + '-7'
							} else if (
								middleRightSprite === (path + '-5')
								&& validGrassSiblings.includes(bottomMiddleSprite)
								&& topMiddleSprite === (path + '-5')
								&& middleLeftSprite === (path + '-5')
							) {
								tile.img2 = path + '-8'
							} else if (
								validGrassSiblings.includes(middleRightSprite)
								&& validGrassSiblings.includes(bottomMiddleSprite)
								&& topMiddleSprite === (path + '-5')
								&& middleLeftSprite === (path + '-5')
							) {
								tile.img2 = path + '-9'
							} else {
								tile.img2 = path + '-5'
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
	run: patherize,
}
