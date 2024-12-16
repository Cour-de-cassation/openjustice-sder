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

const ids = [
  /*
  'jurinet:1952533',
  'jurinet:1952723',
  'jurinet:1952534',
  'jurinet:1952725',
  'jurinet:1952535',
  'jurinet:1952732',
  'jurinet:1952733',
  'jurinet:1952734',
  'jurinet:1952537',
  'jurinet:1952538',
  'jurinet:1952539',
  'jurinet:1952540',
  */
];

async function main() {
  console.log('OpenJustice - Start "reinject" job:', new Date().toLocaleString());
  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i];
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
    }
  } else {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const database = client.db(process.env.MONGO_DBNAME);
    const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
    const jurinetSource = new JurinetOracle();
    await jurinetSource.connect();
    let raw;
    let count = 0;
    const cursor = await rawJurinet.find({ IND_ANO: 1, XMLA: null }, { allowDiskUse: true });
    while ((raw = await cursor.next())) {
      const decision = await decisions.findOne({ sourceId: raw._id, sourceName: 'jurinet' });
      let exists = false;
      try {
        exists = await jurinetSource.testDecisionByID(raw._id);
      } catch (ignore) {
        exists = false;
      }
      if (exists && decision.labelStatus === 'exported' /*&& decision.solution !== 'Rejet non spécialement motivé'*/) {
        // console.log(raw._id);
        await reinjectJurinet(raw._id);
        count++;
      }
    }
    await cursor.close();
    await client.close();
    await jurinetSource.close();
    console.log(count);
  }
  console.log('OpenJustice - End "reinject" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function reinjectJurinet(id) {
  const client = new MongoClient(process.env.MONGO_URI);
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
        let raw = await rawJurinet.findOne({ _id: decision.sourceId });
        if (raw) {
          console.log(`reinject decision ${decision.sourceId}...`);
          await jurinetSource.reinject(decision);
        } else {
          console.log(`skip reinject decision ${decision.sourceId}...`);
        }
        const reinjected = await jurinetSource.getDecisionByID(decision.sourceId);
        reinjected.DT_ANO = new Date();
        reinjected.DT_MODIF = new Date();
        reinjected.DT_MODIF_ANO = new Date();
        await rawJurinet.replaceOne({ _id: reinjected._id }, reinjected, { bypassDocumentValidation: true });
        decision.dateCreation = new Date().toISOString();
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        if (raw) {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'reinject');
        } else {
          await JudilibreIndex.updateDecisionDocument(decision, null, 'skip reinject');
        }
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
  const client = new MongoClient(process.env.MONGO_URI);
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

main();
