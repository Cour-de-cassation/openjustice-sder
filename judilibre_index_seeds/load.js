const { MongoClient, BSON } = require('mongodb');
const { readFile, readdir } = require('fs/promises');
const { resolve } = require('path');
if (!process.env.NODE_ENV) require('dotenv').config();

async function readCollections() {
  const path = resolve(__dirname, 'db')
  const files = await readdir(path);
  return files.map((_) => ({
    collectionName: _.slice(0, _.length - '.json'.length),
    path: resolve(path, _),
  }));
}

async function saveCollections(client, { collectionName, path }) {
  const collection = await client.db().createCollection(collectionName);
  const save = await readFile(path, 'utf8');
  const saveParse = BSON.EJSON.parse(save)
  if (saveParse.length <= 0) return;
  return collection.insertMany(saveParse);
}

async function main() {
  const client = new MongoClient(process.env.INDEX_DB_URI);
  await client.connect();
  const collections = await readCollections(client)
  return Promise.all(collections.map(_ => saveCollections(client, _)));
}

main()
  .then(console.log)
  .catch(console.error)
  .finally((_) => process.exit());
