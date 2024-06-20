const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

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
  console.log('OpenJustice - Start "import_decatt" job:', new Date().toLocaleString());
  try {
    await importDecatt();
  } catch (e) {
    console.error('Decatt import error', e);
  }
  console.log('OpenJustice - End "import_decatt" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function importDecatt() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let allDecatt = [];

  // 1a. Get all _decatt from rawJurinet...

  let rawJurinetDocument;
  const rawJurinetCursor = await rawJurinet.find(
    { TYPE_ARRET: 'CC', _decatt: { $ne: null } },
    {
      allowDiskUse: true,
      fields: {
        _id: 1,
        _decatt: 1,
      },
    },
  );
  while ((rawJurinetDocument = await rawJurinetCursor.next())) {
    if (
      rawJurinetDocument._decatt &&
      Array.isArray(rawJurinetDocument._decatt) &&
      rawJurinetDocument._decatt.length > 0
    ) {
      for (let i = 0; i < rawJurinetDocument._decatt.length; i++) {
        if (allDecatt.indexOf(rawJurinetDocument._decatt[i]) === -1) {
          allDecatt.push(rawJurinetDocument._decatt[i]);
        }
      }
    }
  }

  // 1b. Get all decatt from decisions...

  let decisionDocument;
  const decisionCursor = await decisions.find(
    { sourceName: 'jurinet', decatt: { $ne: null } },
    {
      allowDiskUse: true,
      fields: {
        sourceId: 1,
        decatt: 1,
      },
    },
  );
  while ((decisionDocument = await decisionCursor.next())) {
    if (decisionDocument.decatt && Array.isArray(decisionDocument.decatt) && decisionDocument.decatt.length > 0) {
      for (let i = 0; i < decisionDocument.decatt.length; i++) {
        if (allDecatt.indexOf(decisionDocument.decatt[i]) === -1) {
          allDecatt.push(decisionDocument.decatt[i]);
        }
      }
    }
  }

  console.log(`There are ${allDecatt.length} decatt to process...`);

  // 2. (re)Import every decatt...
  for (let i = 0; i < allDecatt.length; i++) {
    // not anymore await JuricaUtils.ImportDecatt(allDecatt[i], juricaSource, rawJurica, decisions);
  }

  await juricaSource.close();
  await client.close();
  return true;
}

main();
