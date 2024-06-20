const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
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
  console.log('OpenJustice - Start "patch_duplicates" job:', new Date().toLocaleString());
  try {
    await patchDuplicates();
  } catch (e) {
    console.error('patchDuplicates error', e);
  }
  console.log('OpenJustice - End "patch_duplicates" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function patchDuplicates() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let duplicates = [];
  let decision;
  const cursor = await decisions
    .find({ sourceName: 'jurinet' }, { allowDiskUse: true })
    .sort({ sourceId: -1 })
    .limit(1000);
  while ((decision = await cursor.next())) {
    const count = await decisions.countDocuments({ sourceId: decision.sourceId, sourceName: 'jurinet' });
    if (count > 1 && duplicates.indexOf(decision.sourceId) === -1) {
      duplicates.push(decision.sourceId);
    }
  }
  await cursor.close();

  console.log(`Done patching duplicates - Duplicates: ${duplicates.length}.`);
  console.log(duplicates.length);
  await client.close();
  return true;
}

main();
