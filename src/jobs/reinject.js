const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const ms = require('ms');

let selfKill = setTimeout(cancel, ms('1h'));

function end() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('done');
  kill(0);
}

function cancel() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('cancelled');
  kill(1);
}

function kill(code) {
  process.exit(code);
}

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
  setTimeout(end, ms('1s'));
}

async function reinjectJurinet() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  console.log('Retrieve all "done" decisions for Jurinet...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions
    .find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true })
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`reinject decision ${decision.sourceId}...`);
        await jurinetSource.reinject(decision);
        const reinjected = await jurinetSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurinet.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        // The labelStatus of the decision goes from 'done' to 'exported'.
        // We don't do this in the 'reinject' method because we may need
        // to reinject some decisions independently of the Label workflow:
        decision.labelStatus = 'exported';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        successCount++;
      }
    } catch (e) {
      console.error(`Jurinet reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
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
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
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
        const reinjected = await juricaSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        await rawJurica.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        // The labelStatus of the decision goes from 'done' to 'exported'.
        // We don't do this in the 'reinject' method because we may need
        // to reinject some decisions independently of the Label workflow:
        decision.labelStatus = 'exported';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        successCount++;
      }
    } catch (e) {
      console.error(`Jurica reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  console.log(`Jurica reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await juricaSource.close();
  await client.close();
  return true;
}

main();
