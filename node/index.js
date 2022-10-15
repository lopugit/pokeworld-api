require('dotenv').config()
const bodyParser = require('body-parser')
const express = require('express')
const cors = require('cors')
const app = express()
app.use(bodyParser.json())
const port = process.env.PORT
const axios = require('axios')
const pug = require('pug')
const { DateTime } = require('luxon')
const bcrypt = require('bcrypt')
const saltRounds = 10
const { get } = require('lodash')
const { roundToNearestTude, getMapAt } = require('./functions.js')
const fs = require('fs')

// Mongodb setup
let cacheCollection
let blocks
try {
	const { MongoClient } = require('mongodb')
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
			blocks = client.db(process.env.MONGODB_DB).collection('blocks')
		}
	})
} catch (err) {
	console.error(err)
}

// Express middleware
app.use(cors({
	origin: '*',
}))

app.get('/', (req, res) => {
	res.status(200).send('Hello Pokeworld!')
})

app.get('/v1/block', async (req, res) => {

	const { lat, lng } = req.query
	// const roundedLat = roundToNearestTude(lat)
	// const roundedLng = roundToNearestTude(lng)

	const response = await getMapAt(lat, lng)
		.catch(err => {
			console.error(err.response.data)
		})

	if (get(response, 'data')) {
		console.log('response.data', response.data)
		fs.writeFileSync('./test1.png', response.data)
		res.setHeader('Content-Type', 'image/png')
		res.setHeader('Content-Length', response.data.length)
		res.send(response.data)
	}

})

app.get('/privacy-policy', async (req, res) => res.status(200).send(pug.compile(`
.privacy-policy(
  style="max-width: 600px margin: 0 auto padding-top: 100px"
)
  h1.title.text-white(
    style='fontSize: 48px fontWeight: bold'
  )
    | Privacy Policy
  p.subtitle
    | The friendly Pokeworld API Privacy Policy
  p.answer
    .pt-12 This API uses YouTube API Services
    .pt-12 Pokeworld API does not use any analytics tools to store any data, nor does it store any user data of any kind.
    .pt-12 We do not allow any 3rd parties to serve Ads on Pokeworld API
  .pt-12 You can contact Pokeworld API at
    a(href='emailto:pokeworldAPI@alopu.com', style="padding-left: 6px") pokeworldAPI@alopu.com
  .pt-12
    a.underline(href='https://www.youtube.com/t/terms') YouTube Terms of Service
  .pt-12
    a.underline(href='https://policies.google.com/privacy') Google Privacy Policy
style(type="text/css").
  .pt-12 { padding-top: 12px }
`)()))

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`)
})
