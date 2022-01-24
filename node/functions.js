const increments = []
// Const increment = 0.001351351351351
const increment = 0.0013513513513513514

for (let i = 0; i <= 740; i++) {
	increments.push(Math.round((i * increment) * 1000000000000000))
}

function roundToNearestTude(num) {

	const latBase = Math.floor(num)
	const decimal = num - latBase
	const unit = decimal / increment
	const unitBase = Math.floor(unit)
	const unitDecimal = unit - unitBase
	const unitDecimalRounded = Math.round(unitDecimal)
	const rounded = latBase + (unitBase * increment) + (unitDecimalRounded * increment)

	return rounded

}

module.exports = { increments, increment, roundToNearestTude }
