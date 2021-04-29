const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { MongoClient } = require('mongodb');

async function main() {
  console.log('OpenJustice - Start "reinject" job:', new Date().toLocaleString());
  try {
    await reinjectJurinet();
  } catch (e) {
    console.error('Jurinet reinject error', e);
  }
  try {
    await reinjectJurica();
  } catch (e) {
    console.error('Jurica reinject error', e);
  }
  console.log('OpenJustice - End "reinject" job:', new Date().toLocaleString());
  setTimeout(end, 1000);
}

function end() {
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

async function reinjectJurinet() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  console.log('Retrieve all "done" decisions for Jurinet...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        await jurinetSource.reinject(decision);
        // The labelStatus of the decision goes from 'done' to 'exported'.
        // We don't do this in the 'reinject' method because we may need
        // to reinject some decisions independently of the Label workflow:
        decision.labelStatus = 'exported';
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        successCount++;
      }
    } catch (e) {
      console.error(`Jurinet reinjection error processing decision ${decision._id}`, e);
      errorCount++;
    }
  }
  console.log(`Jurinet reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await jurinetSource.close();
  await client.close();
  return true;
}

async function reinjectJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  console.log('Retrieve all "done" decisions for Jurica...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurica' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        await juricaSource.reinject(decision);
        // The labelStatus of the decision goes from 'done' to 'exported'.
        // We don't do this in the 'reinject' method because we may need
        // to reinject some decisions independently of the Label workflow:
        decision.labelStatus = 'exported';
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        successCount++;
      }
    } catch (e) {
      console.error(`Jurica reinjection error processing decision ${decision._id}`, e);
      errorCount++;
    }
  }
  console.log(`Jurica reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await juricaSource.close();
  await client.close();
  return true;
}

main();
