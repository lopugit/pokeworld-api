const apis = require('../apis.js')

// test v1 block
test(false, 'v1 block returns map at longitude latitude', async () => {
	const resp = await apis.v1Block({
		query: {
			lng: 145.00569971273293,
			lat: -37.87569351417865,
			skipTilesExtraction: true,
			deleteOldTiles: false,
			regenerate: true,
		},
	})
	if (resp.status === 200) {
		return true
	}

	return resp
})

// test v1 block
test(true, 'v1 block returns map at longitude latitude', async () => {
	const resp = await apis.v1Block({
		query: {
			blockX: 946648,
			blockY: 488527,
			skipTilesExtraction: false,
			deleteOldTiles: false,
			regenerate: true,
		},
	})
	if (resp.status === 200) {
		return true
	}

	return resp

})

// test v1 block
test(false, 'v1 block renders block', async () => {
	const resp = await apis.v1Block({
		query: {
			lng: 145.00569971273293,
			lat: -37.87569351417865,
			regenerate: true,
		},
	})
	if (resp.status === 200) {
		return true
	}
})

async function test(run, name, callback) {
	if (run) {
		console.log('Running test', name)
		const res = await callback(name)
		console.log('Result:', res)
	}
}
