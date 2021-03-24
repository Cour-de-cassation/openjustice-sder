require('dotenv').config();
const { JurinetOracle } = require('./jurinet-oracle');
const { MongoClient } = require('mongodb');

console.log('Setup...');

/* INIT JURINET */
const jurinetSource = new JurinetOracle({
  verbose: true,
});

/* MAIN LOOP */
async function main() {
  // GET 'DONE' DECISIONS
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const done = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' });

  /*
  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: batchSize,
    all: true,
    titrage: true,
    order: jurinetOrder,
  });
  await jurinetSource.close();

  await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
    bypassDocumentValidation: true,
  });
  */

  console.log('Teardown Main Loop...');
  await client.close();
  console.log('Exit Main Loop.');
}

console.log('Run...');

main();
