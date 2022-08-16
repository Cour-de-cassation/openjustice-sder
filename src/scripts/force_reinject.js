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

async function main(id) {
  console.log('OpenJustice - Start "reinject" job:', new Date().toLocaleString());
  id = `${id}`.split(':');
  if (id && id.length == 2) {
    if (id[0] === 'jurinet') {
      try {
        await reinjectJurinet(parseInt(id[1], 10));
      } catch (e) {
        console.error('Jurinet reinject error', e);
      }
    } else if (id[0] === 'jurica') {
      try {
        await reinjectJurica(parseInt(id[1], 10));
      } catch (e) {
        console.error('Jurica reinject error', e);
      }
    } else {
      console.error(`Cannot process id ${id[0]}:${id[1]}.`);
    }
  } else {
    console.error(`Cannot process id ${id}.`);
  }
  console.log('OpenJustice - End "reinject" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function reinjectJurinet(id) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ sourceId: id, sourceName: 'jurinet' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        console.log(`reinject decision ${decision.sourceId}...`);
        await jurinetSource.reinject(decision);
        const reinjected = await jurinetSource.getDecisionByID(decision.sourceId);
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurinet.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        await JudilibreIndex.updateDecisionDocument(decision, null, 'force reinject');
        successCount++;
      }
    } catch (e) {
      console.error(`Jurinet forced reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  console.log(`Jurinet forced reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await cursor.close();
  await jurinetSource.close();
  await client.close();
  return true;
}

async function reinjectJurica(id) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ sourceId: id, sourceName: 'jurica' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        await juricaSource.reinject(decision);
        const reinjected = await juricaSource.getDecisionByID(decision.sourceId);
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurica.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        await JudilibreIndex.updateDecisionDocument(decision, null, 'force reinject');
        successCount++;
      }
    } catch (e) {
      console.error(`Jurica forced reinjection error processing decision ${decision._id}`, e);
      await JudilibreIndex.updateDecisionDocument(decision, null, null, e);
      errorCount++;
    }
  }
  console.log(`Jurica forced reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await cursor.close();
  await juricaSource.close();
  await client.close();
  return true;
}

main(/* 'jurinet:1796675' */);