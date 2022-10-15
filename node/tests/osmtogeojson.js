const osmtogeojson = require('osmtogeojson')
const fs = require('fs')

const xml = fs.readFileSync('./assets/osm/Melbourne.osm')
const json = osmtogeojson(xml)

console.log('hmm')
