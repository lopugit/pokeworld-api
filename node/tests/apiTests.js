const apis = require('../apis.js')

// test v1 block
test('v1 block returns map at longitude latitude', async () => {
	const resp = await apis.v1Block({
		query: {
			lng: 145.00569971273293,
			lat: -37.87569351417865,
			regenerate: false,
		},
	})
	if (resp.status === 200) {
		return true
	}
})

async function test(name, callback) {
	console.log('Running test', name)
	const res = await callback(name)
	console.log('Result:', res)
}
