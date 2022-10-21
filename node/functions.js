const fs = require('fs')
require('dotenv').config()
const { get } = require('lodash')
const axios = require('axios')
const throttledQueue = require('throttled-queue');
const sharp = require('sharp')
const { MongoClient } = require('mongodb')

console.log(process.cwd())

const lats = JSON.parse(fs.readFileSync('./assets/lats.json'))
const lngs = JSON.parse(fs.readFileSync('./assets/lngs.json'))

const saveMapAtThrottled = throttledQueue(50, 1000)

function getXIncrement(width = 512, zoom = 20, scale = 2) {
	const degreesPerMeterAtEquator = 360 / (2 * Math.PI * 6378137)
	const metresAtEquatorPerTilePx = (156543.03392 / (2 ** zoom))
	const multiplier = 1
	const lngIncrement = (degreesPerMeterAtEquator * metresAtEquatorPerTilePx * (width / scale)) * multiplier
	return lngIncrement
}

function getYIncrement(lat, width = 512, zoom = 20, scale = 2) {
	const degreesPerMeterAtEquator = 360 / (2 * Math.PI * 6378137)
	const metresAtEquatorPerTilePx = (156543.03392 / (2 ** zoom))
	const multiplier = 1
	return (degreesPerMeterAtEquator * Math.cos(lat * Math.PI / 180) * metresAtEquatorPerTilePx * (width / scale)) * multiplier
}

const generateMap = ({
	latStart,
	lngStart,
	latEnd,
	lngEnd,
	startX = 0,
	endX = 10,
	startY = 0,
	endY = 10,
	zoom = 20,
	path = './assets/db',
	json = false,
	html = false,
	images = false,
	mongodb = false,
}) => {

	// Mongodb setup
	let cacheCollection
	let map
	try {
		const url = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_CLUSTER}.nhb33.mongodb.net/${process.env.MONGODB_DB}?retryWrites=true&w=majority`
		console.log('Connecting to MongoDB with url', url)
		const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })

		// Connect to client
		client.connect(err => {
			if (err) {
				console.error('Connection failed', err)
			} else {
				console.log('Connected to MongoDB')
				cacheCollection = client.db(process.env.MONGODB_DB).collection('cache')
				map = client.db(process.env.MONGODB_DB).collection('map')
			}
		})
	} catch (err) {
		console.error(err)
	}

	// Init
	if (typeof latStart === 'number' && typeof latEnd === 'number' && typeof lngStart === 'number' && typeof lngEnd === 'number') {
		const max = Math.max(lats.length, lngs.length)
		for (let i = 0; i < max; i++) {
			if (lngs[i]) {
				if (lngStart > lngs[i].lng) {
					startX = lngs[i].x
				}

				if (lngEnd > lngs[i].lng) {
					endX = lngs[i].x
				}
			}

			if (lats[i]) {
				if (latStart > lats[i].lat) {
					startY = lats[i].y
				}

				if (latEnd > lats[i].lat) {
					endY = lats[i].y
				}
			}
		}
	}

	const coords = {
		x: {
			start: startX,
			end: endX,
		},
		y: {
			start: startY,
			end: endY,
		},
	}

	console.log('coords', coords)

	// initialize dirs
	initDirs(path)

	const grid = {}

	let currentX = startX
	let currentY = startY
	let currentXWithinBounds = currentX < endX

	while (currentXWithinBounds) {

		if (json) {
			grid[currentY] = grid[currentY] || {}
			grid[currentY][currentX] = {}
		}

		console.log(`${currentX}_${currentY}`)
		// console.log(`currentX: ${currentX}, currentY: ${currentY}`)
		// console.log(`lng: ${lngs[currentX].lng}, lat: ${lats[currentY].lat}`)

		const cX = currentX
		const cY = currentY
		if (images) {
			saveMapAtThrottled(() => saveMapAt(cX, cY, lats[cY].lat, lngs[cX].lng, `${path}/tiles`, zoom))
		}

		currentY += 1

		const currentYOverBounds = currentY > endY
		if (currentYOverBounds) {
			currentY = startY
			currentX += 1

		}

		currentXWithinBounds = currentX < endX

	}

	generateOutputs(grid, path, json, html)

}

function generateOutputs(grid, path, json, html) {
	if (json) {
		fs.writeFileSync(`${path}/grid.json`, JSON.stringify(grid, null, 2))
	}

	if (html) {
		const template = body => `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<style>
					body {
						padding: 0px;
						margin: 0px;
					}
					.row {
						display: flex;
						align-items: flex-start;
						justify-content: flex-start;
					}
					.column {
						display: flex;
						flex-direction: column;
						align-items: flex-start;
						justify-content: flex-start;
					}
					img {
						max-width: 450px;
						height: auto;
						padding: 0px; 
						margin: 0px;
					}
					</style>
				</head>
				<body>
					${body}
				</body>
			</html>
		`
		let body = ''
		for (let iY = Object.keys(grid).length - 1; iY >= 0; iY--) {
			const currentX = Object.keys(grid)[iY]
			const currentYs = Object.keys(grid[currentX])
			body += '<div class="row">\n'
			for (let iY = 0; iY < currentYs.length; iY++) {
				body += '<div class="column">\n'
				const currentY = currentYs[iY]
				for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
					body += '<div class="row">\n'
					for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
						body += `<img src="tiles/${currentY}_${currentX}-tile-${offsetX}_${offsetY}.png" />\n`
					}

					body += '</div>\n'
				}

				body += '</div>\n'
			}

			body += '</div>\n'
		}

		fs.writeFileSync(`${path}/index.html`, template(body))
	}

}

function initDirs(path) {
	if (fs.existsSync(path)) {
		fs.rmdirSync(path, { recursive: true })
	}

	fs.mkdirSync(path, { recursive: true })
	fs.mkdirSync(path + '/lats', { recursive: true })
	fs.mkdirSync(path + '/tiles', { recursive: true })

}

function formatCoord(coord) {
	let coordFormatted = coord.toString().replace('-', 'n')
	if (coordFormatted[0] !== 'n') {
		coordFormatted = 'p' + coordFormatted
	}

	return coordFormatted
}

async function saveMapAt(x, y, lat, lng, path, zoom) {
	const image = await getMapAt(lat, lng, zoom)

	const promises = []

	for (let offsetX = 0; offsetX < 512 / 32; offsetX++) {
		for (let offsetY = 0; offsetY < 512 / 32; offsetY++) {
			promises.push(sharp(image)
				.extract({ left: offsetX * 32, top: offsetY * 32, width: 32, height: 32 })
				.toFile(`${path}/${x}_${y}-tile-${offsetX}_${offsetY}.png`),
			)
		}
	}

	await Promise.all(promises)

	// fs.rmSync(`${path}/${x}_${y}.png`)
	// fs.rmSync(`${path}/${x}_${y}-source.png`)

}

async function getMapAt(lat, lng, zoom = 20) {
	const response = await axios.get('https://maps.googleapis.com/maps/api/staticmap', {
		params: {
			center: `${lat},${lng}`,
			zoom,
			scale: 2,
			size: '640x640',
			key: process.env.GOOGLE_API_KEY,
			maptype: 'roadmap',
			/* eslint-disable camelcase */
			map_id: '9bfcc2fdf1e48fe2',
			// style: 'feature:all|element:labels|visibility:off',
		},
		responseType: 'arraybuffer',
		headers: {
			'Content-Type': 'image/png',
			Connection: 'keep-alive',
			'Keep-Alive': 'timeout=1500, max=100',
		},
	})
		.catch(err => {
			console.error('Error fetching image data', err.response.statusText)
		})

	if (get(response, 'data')) {
		return sharp(response.data)
			.extract({ left: 64, top: 64, width: 512, height: 512 })
			.toBuffer()
	}

	return 'No image'
}

async function generateCoordinatesGrid({
	write = false,
	mongodb = false,
}) {

	// Mongodb setup
	let cacheCollection
	let map
	try {
		const url = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PWD}@${process.env.MONGODB_CLUSTER}.nhb33.mongodb.net/${process.env.MONGODB_DB}?retryWrites=true&w=majority`
		console.log('Connecting to MongoDB with url', url)
		const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true })

		// Connect to client
		await client.connect()
		console.log('Connected to MongoDB')
		cacheCollection = await client.db(process.env.MONGODB_DB).collection('cache')
		map = await client.db(process.env.MONGODB_DB).collection('map')
	} catch (err) {
		console.error(err)
	}

	const lats = []
	const latsMap = {}
	for (let lat = -87; lat < 87; lat += getYIncrement(lat, 512, 20, 2)) {
		latsMap[Math.floor(lat)] = latsMap[Math.floor(lat)] || []
		const latObj = {
			y: lats.length,
			lat,
			latCenter: lat + (getYIncrement(lat, 512, 20, 2) / 2),
		}
		lats.push(latObj)
		latsMap[Math.floor(lat)].push(latObj)
	}

	console.log('Generated', lats.length, 'tiles')
	if (write) {
		fs.writeFileSync('./assets/lats-example.json', JSON.stringify(lats.slice(0, 5), null, 2))
		fs.writeFileSync('./assets/lats.json', JSON.stringify(lats, null, 2))
		fs.writeFileSync('./assets/latsMap.json', JSON.stringify(latsMap, null, 2))
	}

	const lngs = []
	const lngsMap = {}
	const lngIncrement = getXIncrement(512, 20, 2)
	for (let lng = -180; lng < 180; lng += lngIncrement) {
		lngsMap[Math.floor(lng)] = lngsMap[Math.floor(lng)] || []
		const lngObj = {
			x: lngs.length,
			lng,
			lngCenter: lng + (lngIncrement / 2),
		}
		lngsMap[Math.floor(lng)].push(lngObj)
		lngs.push(lngObj)
	}

	console.log('Generated', lngs.length, 'tiles')
	if (write) {
		fs.writeFileSync('./assets/lngs-example.json', JSON.stringify(lngs.slice(0, 5), null, 2))
		fs.writeFileSync('./assets/lngs.json', JSON.stringify(lngs, null, 2))
		fs.writeFileSync('./assets/lngsMap.json', JSON.stringify(lngsMap, null, 2))
	}

	console.log('Done, maybe running mongodb')

	if (mongodb) {
		let count = 0
		setInterval(() => {
			console.log('Current count', count)
		}, 4000)
		await map.deleteMany({})
		for (const lat of lats) {
			for (const lng of lngs) {
				await map.insertOne({
					geojson: {
						type: 'Point',
						coordinates: [lng.center, lat.center],
					},
					x: lng.i,
					y: lat.i,
					key: `${lng.i}_${lat.i}`,
					px: 512,
					zoom: 20,
					scale: 2,
					created: new Date(),
				}).catch(err => {
					console.error('Error inserting map tile', err)
				})
				count++
			}
		}
	}

}

module.exports = { generateCoordinatesGrid, generateMap, getMapAt }
