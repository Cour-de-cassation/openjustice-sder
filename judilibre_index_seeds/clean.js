const { MongoClient } = require('mongodb')
if (!process.env.NODE_ENV) require('dotenv')

async function main() {
  const client = new MongoClient(process.env.INDEX_DB_URI)
  await client.connect()

  const collections = await client.db(process.env.INDEX_DB_NAME).collections()

  return Promise.all(collections.map((_) => _.drop()))
}

main()
  .then(console.log)
  .catch(console.error)
  .finally((_) => process.exit())
