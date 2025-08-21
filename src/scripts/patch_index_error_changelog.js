const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { MongoClient } = require('mongodb');
const { parentPort } = require('worker_threads');
const { JudilibreIndex } = require('../judilibre-index');
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
    await patch1();
  } catch (e) {
    console.error('patch1 error', e);
  }
  try {
    await patch2();
  } catch (e) {
    console.error('patch2 error', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch1() {
  const result = await JudilibreIndex.find('mainIndex', { error: /changelog/i });

  for (let i = 0; i < result.length; i++) {
    let indexedDoc = result[i];
    indexedDoc.error = null;
    indexedDoc.dateError = null;
    await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
      bypassDocumentValidation: true,
    });
  }

  return true;
}

async function patch2() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const result = await JudilibreIndex.find('mainIndex', { 'log.msg': /changelog/i });

  for (let i = 0; i < result.length; i++) {
    let indexedDoc = result[i];
    const changelog = {};
    const sourceName = `${indexedDoc._id}`.split(':')[0];
    const sourceId = parseInt(`${indexedDoc._id}`.split(':')[1], 10);
    let normalized = await decisions.findOne({ sourceId: sourceId, sourceName: sourceName });
    if (normalized) {
      await JudilibreIndex.updateDecisionDocument(
        normalized,
        null,
        `update in decisions (sync2) - changelog: ${JSON.stringify(changelog)}`,
      );
    }
  }
  await client.close();

  return true;
}

main();
