const { MongoClient } = require('mongodb')
const { writeFile } = require('fs/promises')
const { existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
if (!process.env.NODE_ENV) require('dotenv').config()

const DB_PATH = resolve(__dirname, 'db')

async function exportCollection(collection) {
  const { collectionName } = collection
  const raw = await collection.find().toArray()

  if (!existsSync(DB_PATH)) mkdirSync(DB_PATH)

  return writeFile(resolve(DB_PATH, `${collectionName}.json`), JSON.stringify(raw, null, 2), 'utf8')
}

async function main() {
  const client = new MongoClient(process.env.INDEX_DB_URI)
  await client.connect()

  const dbCollections = await client.db(process.env.INDEX_DB_NAME).collections()
  const collections = dbCollections.flat()

  return Promise.all(collections.map(exportCollection))
}

main()
  .catch(console.error)
  .finally((_) => process.exit())
