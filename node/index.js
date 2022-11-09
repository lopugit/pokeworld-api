require('dotenv').config()
const bodyParser = require('body-parser')
const compression = require('compression')
const express = require('express')
const cors = require('cors')
const app = express()
app.use(compression())
app.use(bodyParser.json())
const port = process.env.PORT
const pug = require('pug')
const apis = require('./apis.js')

// Express middleware
app.use(cors({
	origin: '*',
}))

app.get('/', (req, res) => {
	res.status(200).send('Hello Pokeworld!')
})

app.get('/v1/blocks', async (req, res) => {
	const resp = await apis.v1Blocks(req)
	console.log('Done v1 blocks')
	if (resp) {
		res.status(resp.status).send(resp.send)
	} else {
		res.status(400).send('Something went wrong')
	}
})
app.get('/v1/batchBlocks', async (req, res) => {
	const resp = await apis.v1BatchBlocks(req)
	console.log('Done v1 batch blocks')
	if (resp) {
		res.status(resp.status).send(resp.send)
	} else {
		res.status(400).send('Something went wrong')
	}
})
app.get('/v1/blockLatLng', async (req, res) => {
	const resp = await apis.v1BlockLatLng(req)
	if (resp) {
		res.status(resp.status).send(resp.send)
	} else {
		res.status(400).send('Something went wrong')
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
	console.log(`Pokemon World listening at http://localhost:${port}`)
})
