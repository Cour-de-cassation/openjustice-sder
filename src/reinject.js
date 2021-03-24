require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { JurinetOracle } = require('./jurinet-oracle');
const { JurinetUtils } = require('./jurinet-utils');
const { MongoClient } = require('mongodb');

console.log('Setup...');

/* INIT JURINET */
const jurinetSource = new JurinetOracle({
  verbose: true,
});

/* MAIN LOOP */
async function main() {
  // PROCESS JURINET
  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: batchSize,
    all: true,
    titrage: true,
    order: jurinetOrder,
  });
  await jurinetSource.close();

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' });
  await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
   bypassDocumentValidation: true,
  });

  console.log('Teardown Main Loop...');
  await client.close();
  console.log('Exit Main Loop.');
}

console.log('Run...');

main();
