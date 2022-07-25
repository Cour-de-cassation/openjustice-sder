const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const ms = require('ms');

let selfKill = setTimeout(cancel, ms('24h'));

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
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  const result = await JudilibreIndex.find('mainIndex', {});

  for (let i = 0; i < result.length; i++) {
    let indexedDoc = result[i];
    let nac = null;
    let doc = null;
    if (!indexedDoc.nac) {
      if (/jurica/.test(indexedDoc._id)) {
        doc = await rawJurica.findOne({ _id: parseInt(indexedDoc._id.split(':')[1], 10) });
        if (doc) {
          nac = `${doc.JDEC_CODNAC}`.trim().toLowerCase();
        }
      }
      if (indexedDoc.nac !== nac) {
        if (nac) {
          indexedDoc.nac = nac;
        } else {
          indexedDoc.nac = null;
        }
        await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
          bypassDocumentValidation: true,
        });
      }
    }
  }

  await client.close();
  return true;
}

main();
