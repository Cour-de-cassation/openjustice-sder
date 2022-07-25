const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { DateTime } = require('luxon');

const { parentPort } = require('worker_threads');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaUtils } = require('../jurica-utils');
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
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const result = await JudilibreIndex.find('mainIndex', {});

  for (let i = 0; i < result.length; i++) {
    let indexedDoc = result[i];
    let decision = null;
    let matiere = null;
    let doc = null;
    if (!indexedDoc.matiere) {
      if (/jurinet/.test(indexedDoc._id)) {
        doc = await rawJurinet.findOne({ _id: parseInt(indexedDoc._id.split(':')[1], 10) });
        if (doc) {
          decision = await decisions.findOne({ sourceId: doc._id, sourceName: 'jurinet' });
          if (decision) {
            matiere = JurinetUtils.GetDecisionThemesForIndexing(decision);
          } else {
            matiere = null;
          }
        }
      } else if (/jurica/.test(indexedDoc._id)) {
        doc = await rawJurica.findOne({ _id: parseInt(indexedDoc._id.split(':')[1], 10) });
        if (doc) {
          decision = await decisions.findOne({ sourceId: doc._id, sourceName: 'jurica' });
          if (decision) {
            matiere = JuricaUtils.GetDecisionThemesForIndexing(decision);
          } else {
            matiere = JuricaUtils.GetThemeByNAC(`${doc.JDEC_CODNAC}`.trim());
          }
        }
      }
      if (indexedDoc.matiere !== matiere) {
        if (matiere) {
          indexedDoc.matiere = matiere;
        } else {
          indexedDoc.matiere = null;
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
