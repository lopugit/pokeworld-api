const { increments, roundToNearestTude } = require('../functions.js')

let passes = 0
let failures = 0
const failedNumbers = []
for (let i = 0; i < 100000; i++) {
	const num = Math.random() / Math.random() / 100
	const numDecimal = num - Math.floor(num)
	const rounded = roundToNearestTude(num)
	const roundedDecimal = rounded - Math.floor(rounded)
	if (increments.includes(Math.round(roundedDecimal * 1000000000000000))) {
		passes++
	} else {
		// Find rounding options
		let found = false
		const matches = []
		for (let i = 0; i < increments.length; i++) {
			if (!found && increments[i] > Math.round(numDecimal * 1000000000000000)) {
				found = true
				matches.push(...[increments[i - 1], increments[i]])
			}
		}

		const roundsTo = Math.round(roundedDecimal * 1000000000000000)

		const difference = 50

		if (Math.abs(roundsTo - matches[0]) < difference || Math.abs(roundsTo - matches[1]) < difference) {
			passes++
		} else {
			failures++
			failedNumbers.push({ num, roundsTo, matches })
		}
	}
}

console.log('Passes:', passes)
console.log('Failures:', failures)
console.log('Failed Numbers:', failedNumbers)
