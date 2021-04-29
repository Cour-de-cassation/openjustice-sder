const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  console.log('OpenJustice - Start "import" job:', new Date().toLocaleString());
  try {
    await importJurinet();
  } catch (e) {
    console.error('Jurinet import error', e);
  }
  try {
    await importJurica();
  } catch (e) {
    console.error('Jurica import error', e);
  }
  console.log('OpenJustice - End "import" job:', new Date().toLocaleString());
  setTimeout(end, 1000);
}

function end() {
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

async function importJurinet() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  console.log(`Get new decisions from Jurinet...`);
  const jurinetResult = await jurinetSource.getNew();

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            try {
              await jurinetSource.markAsImported(row._id);
            } catch (ignore) {}
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet import error (a) processing decision ${row._id}`, e);
          errorCount++;
        }
      } else if (row['AUT_CREATION'] === 'WINCI' || row['TYPE_ARRET'] !== 'CC') {
        try {
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            try {
              await jurinetSource.markAsImported(row._id);
            } catch (ignore) {}
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet import error (b) processing decision ${row._id}`, e);
          errorCount++;
        }
      }
    }
  }

  console.log(`Jurinet import done (new: ${newCount}, skip: ${skipCount}, error: ${errorCount}).`);
  await client.close();
  await jurinetSource.close();
  return true;
}

async function importJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  console.log(`Get new decisions from Jurica...`);
  const juricaResult = await juricaSource.getNew();

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          if (normalized === null) {
            let normDec = await JuricaUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            try {
              await juricaSource.markAsImported(row._id);
            } catch (ignore) {}
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurica import error processing decision ${row._id}`, e);
          errorCount++;
        }
      } else {
        skipCount++;
      }
    }
  }

  console.log(`Jurica import done (new: ${newCount}, skip: ${skipCount}, error: ${errorCount}).`);
  await client.close();
  await juricaSource.close();
  return true;
}

main();
