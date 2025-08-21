const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const { Juritools } = require('../juritools');

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
  console.log('OpenJustice - Start check zoning script:', new Date().toLocaleString());
  try {
    await checkZoningJurica();
  } catch (e) {
    console.error('Jurica check zoning error', e);
  }
  try {
    await checkZoningJurinet();
  } catch (e) {
    console.error('Jurinet check zoning error', e);
  }
  console.log('OpenJustice - End check zoning job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function checkZoningJurinet() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let missingCount = 0;
  let errorCount = 0;
  let decision;
  const cursor = await decisions
    .find(
      { sourceName: 'jurinet' },
      {
        allowDiskUse: true,
      },
    )
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next()) && errorCount < 50) {
    if (decision.pseudoText !== null && decision.jurisdictionCode === 'CC' && decision._zoning === null) {
      missingCount++;
      const zoning = await Juritools.GetZones(decision.sourceId, 'cc', decision.pseudoText);
      if (!zoning || !zoning.zones) {
        console.log(`jurinet:${decision.sourceId}`);
        errorCount++;
      }
    }
  }

  console.log(`Done check zoning Jurinet - Missing: ${missingCount}, Error: ${errorCount}.`);

  await cursor.close();
  await client.close();
  return true;
}

async function checkZoningJurica() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let missingCount = 0;
  let errorCount = 0;
  let decision;
  const cursor = await decisions
    .find(
      { sourceName: 'jurica' },
      {
        allowDiskUse: true,
      },
    )
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next()) && errorCount < 50) {
    if (decision.originalText !== null && decision._zoning === null) {
      missingCount++;
      const zoning = await Juritools.GetZones(decision.sourceId, 'ca', decision.originalText);
      if (!zoning || !zoning.zones) {
        console.log(`jurica:${decision.sourceId}`);
        errorCount++;
      }
    }
  }

  console.log(`Done check zoning Jurica - Missing: ${missingCount}, Error: ${errorCount}.`);

  await cursor.close();
  await client.close();
  return true;
}

main();
