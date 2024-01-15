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
  'jurinet:1922905',
  'jurinet:1922906',
  'jurinet:1922907',
  'jurinet:1922908',
  'jurinet:1922909',
  'jurinet:1929267',
  'jurinet:1925133',
  'jurinet:1925134',
  'jurinet:1925135',
  'jurinet:1925136',
  'jurinet:1925138',
  'jurinet:1925139',
  'jurinet:1925140',
  'jurinet:1925141',
  'jurinet:1927291',
  'jurinet:1927292',
  'jurinet:1927293',
  'jurinet:1927294',
  'jurinet:1927295',
  'jurinet:1927296',
  'jurinet:1927297',
  'jurinet:1927298',
  'jurinet:1927299',
  'jurinet:1929407',
  'jurinet:1929408',
  'jurinet:1929409',
  'jurinet:1929410',
  'jurinet:1929412',
  'jurinet:1929413',
  'jurinet:1929415',
  'jurinet:1929416',
  'jurinet:1929417',
  'jurinet:1929419',
  'jurinet:1929420',
  'jurinet:1929421',
  'jurinet:1929422',
  'jurinet:1929423',
  'jurinet:1929424',
  'jurinet:1929411',
  'jurinet:1929414',
  'jurinet:1927300',
  'jurinet:1927307',
  'jurinet:1922689',
  'jurinet:1929280',
  'jurinet:1922677',
];

async function main() {
  console.log('OpenJustice - Start "reinject" job:', new Date().toLocaleString());
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

main();
