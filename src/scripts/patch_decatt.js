const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const { JuricaOracle } = require('../jurica-oracle');
const { JurinetOracle } = require('../jurinet-oracle');

const ms = require('ms');

let selfKill = setTimeout(cancel, ms('12h'));

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
  try {
    await patch();
  } catch (e) {
    console.error('patch error', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch() {
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

  let rawJurinetDocument;
  const rawJurinetCursor = await rawJurinet.find(
    { TYPE_ARRET: 'CC' },
    {
      allowDiskUse: true,
      fields: {
        _id: 1,
        _decatt: 1,
      },
    },
  );
  while ((rawJurinetDocument = await rawJurinetCursor.next())) {
    if (!rawJurinetDocument._decatt) {
      try {
        let decattInfo = await jurinetSource.getDecatt(rawJurinetDocument[process.env.DB_ID_FIELD]);
        let decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
        console.log('Missing decatt', decatt, 'for', rawJurinetDocument[process.env.DB_ID_FIELD]);
      } catch (e) {
        console.log('No missing decatt for', rawJurinetDocument[process.env.DB_ID_FIELD], e);
      }
    }
  }

  await client.close();
  await jurinetSource.close();
  await juricaSource.close();
  return true;
}

main();
