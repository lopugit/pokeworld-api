const functions = require('../../functions')

const patherizeTile = (tile, tileCache, colours, path) => {

	const validGrassSiblings = [colours.grass, colours.sand, colours.path, colours.road].filter(c => c !== (path + '-5'))

	// const topLeftSprite = functions.getTileOffsetSprite(tile, [-1, 1], tileCache)
	const topMiddleSprite = functions.getTileOffsetSprite(tile, [0, 1], tileCache)
	// const topRightSprite = functions.getTileOffsetSprite(tile, [1, 1], tileCache)
	const middleLeftSprite = functions.getTileOffsetSprite(tile, [-1, 0], tileCache)
	const middleRightSprite = functions.getTileOffsetSprite(tile, [1, 0], tileCache)
	// const bottomLeftSprite = functions.getTileOffsetSprite(tile, [-1, -1], tileCache)
	const bottomMiddleSprite = functions.getTileOffsetSprite(tile, [0, -1], tileCache)
	// const bottomRightSprite = functions.getTileOffsetSprite(tile, [1, -1], tileCache)

	const tileSprite = functions.getTileSprite(tile.mapX, tile.mapY, tileCache)

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
		}
	}

}

module.exports = patherizeTile
