
const functions = require('../functions')

const priority = 1

const baseRoads = (state, block) => {

	const updated = Date.now()

	// turn tiles into sprites
	for (let offsetX = 0; offsetX < 16; offsetX++) {
		for (let offsetY = 0; offsetY < 16; offsetY++) {

			const tile = state.tiles.cache[(block.x * 512) + (offsetX * 32) + ',' + ((block.y * 512) + (offsetY * 32))]

			if (tile) {

				const tilePriority = tile.priority || 0

				if ((!tile.baseRoadGenerated && priority > tilePriority) || state.regenerate) {

					tile.priority = priority
					tile.baseRoadGenerated = true
					tile.updated = updated
					tile.version = state.version

					const grass = '112,192,160'
					const sand = '216,200,128'
					const path = '159,208,191'
					const road = '215,224,232'

					const coloursArray = [grass, sand, path, road]

					const tileColour = functions.getTileOffsetColour(tile, [0, 0], state.tiles.cache, coloursArray)

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

}

module.exports = {
	priority,
	run: baseRoads,
}

