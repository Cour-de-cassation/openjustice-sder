const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JuricaUtils } = require('../jurica-utils');
const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const { DateTime } = require('luxon');
const limit_date = DateTime.fromISO('2022-04-14');
const all_occultations = JSON.stringify(
  [
    'dateNaissance',
    'dateMariage',
    'dateDeces',
    'insee',
    'professionnelMagistratGreffier',
    'personneMorale',
    'etablissement',
    'numeroSiretSiren',
    'adresse',
    'localite',
    'telephoneFax',
    'email',
    'siteWebSensible',
    'compteBancaire',
    'cadastre',
    'plaqueImmatriculation',
  ].sort(),
);
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
  console.log('Start list faulty CA:', new Date().toLocaleString());
  try {
    await listFaultyCA();
  } catch (e) {
    console.error('Jurica retry import error', e);
  }
  console.log('End list faulty CA:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function listFaultyCA() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const cursor = await rawJurica.collection.find({ IND_ANO: 2 }, { allowDiskUse: true }).sort({ _id: -1 });
  while ((rawDocument = await cursor.next())) {
    try {
      const normalized = await decisions.findOne({ sourceId: rawDocument._id, sourceName: 'jurica' });

      if (normalized === null) {
        throw new Error(`Normalized document not found for Jurica decision ${rawDocument._id}.`);
      }

      const decision_date = DateTime.fromISO(JuricaUtils.GetDecisionDateForIndexing(normalized.dateDecision));
      if (decision_date > limit_date) {
        const occultations = normalized.occultation.categoriesToOmit.sort();
        if (JSON.stringify(occultations) === all_occultations) {
          console.log(`Jurica decision ${rawDocument._id} is faulty.`);
        }
      }
    } catch (e) {
      console.error(`Error while processing Jurica decision ${rawDocument._id}.`, e);
    }
  }
  await client.close();
  return true;
}

main();
