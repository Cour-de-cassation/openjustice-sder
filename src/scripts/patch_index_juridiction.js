const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { DateTime } = require('luxon');

const { parentPort } = require('worker_threads');
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
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  const result = await JudilibreIndex.find('mainIndex', {});

  result.forEach(async (indexedDoc) => {
    let juridiction = 'inconnue';
    if (/jurinet/.test(indexedDoc._id)) {
      const res = await rawJurinet.findOne({ _id: parseInt(indexedDoc._id.split(':')[1], 10) });
      if (res) {
        juridiction = `${res.JURIDICTION}`.toLowerCase();
      }
    } else if (/jurica/.test(indexedDoc._id)) {
      const res = await rawJurica.findOne({ _id: parseInt(indexedDoc._id.split(':')[1], 10) });
      if (res) {
        juridiction = `${res.JDEC_JURIDICTION}`.toLowerCase();
      }
    }
    indexedDoc.juridiction = juridiction;
    await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
      bypassDocumentValidation: true,
    });
  });

  // await client.close();
  return true;
}

main();
