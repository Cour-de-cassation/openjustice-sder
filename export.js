require('dotenv').config()
const { MongoClient } = require('mongodb')
const fs = require('fs')
const needle = require('needle')

console.log('Setup...')

/* MAIN */
async function main() {
  fs.writeFileSync('export.txt', '')
  // fs.writeFileSync('export_ca.txt', '')

  // TEST MONGO
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true
  })
  await client.connect()
  const database = client.db(process.env.MONGO_DBNAME)
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION)
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION)

  let count = 0
  let skip = 0
  let cont = true
  let document
  while (cont === true) {
    const cursor = await decisions.find({ sourceName: 'jurinet' }, { allowDiskUse: true }).skip(skip).sort({ sourceId: -1 }).limit(1000)
    // const cursor = await decisions.find({ sourceName: 'jurica' }, { allowDiskUse: true }).skip(skip).sort({ sourceId: -1 }).limit(1000)
    while (cont && (document = await cursor.next())) {
      const source = await rawJurinet.findOne({ _id: document.sourceId })
      if (cont && source.AUT_CREATION !== 'WINCI' && document.jurisdictionCode === 'CC' && document.pseudoText && document.zoning && document.zoning.zones) {
        count++
        console.log(count, document._id, document.sourceId)
  	const response = await needle('post', 'http://dev.opj.intranet.justice.gouv.fr/index',  { index: 'openjustice_0', document: document }, {
    		json: true
  	})
  	console.log(response.body)
	fs.appendFileSync('export.txt', JSON.stringify(document) + '\n')
        if (count > 40000) {
          cont = false
        }
      }
      /*
      if (document.jurisdictionCode !== 'CC' && document.pseudoText) {
        count++
        console.log(count, document._id, document.sourceId)
        let zoning = await getZones(document.sourceId, 'jurica', document.pseudoText)
        console.log(zoning)
        fs.appendFileSync('export_ca.txt', JSON.stringify(document) + '\n')
        if (count > 10000) {
          cont = false
        }
      }
      */
    }
    skip += 1000
  }

  await client.close()

  const response = await needle('post', 'http://dev.opj.intranet.justice.gouv.fr/refresh', { index: 'openjustice_0' }, {
  	json: true
  })
  console.log(response.body)

  console.log('Teardown...')

  console.log('Exit.')
}

async function getZones(id, source, text) {
  const zoneData = JSON.stringify({
    arret_id: id,
    source: source,
    text: text
  })
  const response = await needle('post', 'http://127.0.0.1:8090/zonage', zoneData, {
    json: true
  })
  delete response.body.arret_id
  return response.body
}

console.log('Run...')

main()

// mongoexport --collection=decisions --db=SDER --out=decisions.json --limit=4000 --query='{"sourceName": "jurinet", "sourceId": {"$gt": 1722000}}'
