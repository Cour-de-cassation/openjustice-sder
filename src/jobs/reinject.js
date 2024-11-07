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
  console.log('OpenJustice - Start "reinject" job v20240229_1:', new Date().toLocaleString());
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
  const client = new MongoClient(process.env.MONGO_URI);
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
    .find({ labelStatus: 'done', publishStatus: 'toBePublished', sourceName: 'jurinet' }, { allowDiskUse: true })
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`check CC decision ${decision.sourceId} for reinjection...`);
        let raw = await rawJurinet.findOne({ _id: decision.sourceId });
        if (raw && raw.IND_ANO !== 2) {
          console.log(`reinject CC decision ${decision.sourceId}...`);
          await jurinetSource.reinject(decision);
        } else {
          console.log(`skip reinject CC decision ${decision.sourceId}...`);
        }
        const reinjected = await jurinetSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurinet.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.labelStatus = 'exported';
        decision.publishStatus = 'toBePublished';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        if (raw && raw.IND_ANO !== 2) {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        } else {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'skip reinject');
        }
        successCount++;
      }
    } catch (e) {
      console.error(`Jurinet reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  console.log(`Jurinet reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await cursor.close();
  await jurinetSource.close();
  await client.close();
  return true;
}

async function reinjectJurica() {
  const client = new MongoClient(process.env.MONGO_URI);
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
  const cursor = await decisions.find(
    { labelStatus: 'done', publishStatus: 'toBePublished', sourceName: 'jurica' },
    { allowDiskUse: true },
  );
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`check CA decision ${decision.sourceId} for reinjection...`);
        let raw = await rawJurica.findOne({ _id: decision.sourceId });
        if (raw && raw.IND_ANO !== 2) {
          console.log(`reinject CA decision ${decision.sourceId}...`);
          await juricaSource.reinject(decision);
        } else {
          console.log(`skip reinject CA decision ${decision.sourceId}...`);
        }
        const reinjected = await juricaSource.getDecisionByID(decision.sourceId);
        reinjected._indexed = null;
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurica.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.labelStatus = 'exported';
        decision.publishStatus = 'toBePublished';
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        if (raw && raw.IND_ANO !== 2) {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        } else {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'skip reinject');
        }
        successCount++;
      }
    } catch (e) {
      console.error(`Jurica reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  console.log(`Jurica reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await cursor.close();
  await juricaSource.close();
  await client.close();
  return true;
}

main();
