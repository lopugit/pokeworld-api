const apis = require('../apis.js')
const axios = require('axios')
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
test(false, 'v1 block returns map at longitude latitude', async () => {
	const startTime = Date.now()
	const resp = await apis.v1Block({
		query: {
			blockX: 946648,
			blockY: 488527,
			regenerate: true,
		},
	})
	const endTime = Date.now() - startTime
	console.log('Request took', endTime / 1000, 's')
	if (resp.status === 200) {
		return true
	}

	return resp

})

// test v1 block load native
test(false, 'v1 block returns map at longitude latitude', async () => {
	const startTime = Date.now()
	const proms = []
	const count = 5
	for (let i = 0; i < count; i++) {
		proms.push(
			apis.v1Block({
				query: {
					blockX: 946648 + (i * 3),
					blockY: 488527,
					regenerate: true,
				},
			}),
		)
	}

	await Promise.all(proms)

	const endTime = Date.now() - startTime
	console.log('Requests took', endTime / 1000, 's')

	return true

})

// test v1 block load http
test(true, 'v1 block http request returns 5 block requests in good time', async () => {
	const startTime = Date.now()
	const proms = []
	const count = 5
	for (let i = 0; i < count; i++) {
		proms.push(
			axios.get('http://localhost:8018/v1/block', {
				params: {
					blockX: 946648 + (i * 3),
					blockY: 488527,
					regenerate: true,
				},

			}),
		)
	}

	await Promise.all(proms)

	const endTime = Date.now() - startTime
	console.log('Requests took', endTime / 1000, 's')

	return true

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
