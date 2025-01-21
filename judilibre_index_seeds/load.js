const { MongoClient, BSON } = require('mongodb');
const { readFile, readdir } = require('fs/promises');
const { resolve } = require('path');
if (!process.env.NODE_ENV) require('dotenv').config();

const DB_PATH = resolve(__dirname, 'db')

async function readCollectionNames(dbName) {
  const files = await readdir(DB_PATH);
  return files.map((_) => ({
    dbName,
    collectionName: _.slice(0, _.length - '.json'.length),
    path: resolve(DB_PATH, _),
  }));
}

async function saveCollections(client, { dbName, collectionName, path }) {
  const collection = await client.db(dbName).createCollection(collectionName);
  const save = await readFile(path, 'utf8');
  
  const saveParse = BSON.EJSON.parse(save)

  if (saveParse.length <= 0) return;
  return collection.insertMany(saveParse);
}

async function main() {
  const client = new MongoClient(process.env.INDEX_DB_URI);
  await client.connect();

  const dbNames = [process.env.INDEX_DB_NAME];
  const collections = (await Promise.all(dbNames.map(readCollectionNames))).flat();

  return Promise.all(collections.map((_) => saveCollections(client, _)));
}

main()
  .then(console.log)
  .catch(console.error)
  .finally((_) => process.exit());
