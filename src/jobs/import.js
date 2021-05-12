const fs = require('fs');
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

let selfKill = setTimeout(cancel, ms('30m'));

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
  setTimeout(end, ms('1s'));
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
  let wincicaCount = 0;

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
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet import error processing decision ${row._id}`, e);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Importing Jurinet - New: ${newCount}, Skip: ${skipCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
  );
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
  let duplicateCount = 0;

  const juricaResult = await juricaSource.getNew();

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });

          let duplicate;
          try {
            let duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicate = true;
            } else {
              duplicate = false;
            }
          } catch (e) {
            duplicate = false;
          }

          if (duplicate === false) {
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
          } else {
            duplicateCount++;
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

  console.log(
    `Done Importing Jurica - New: ${newCount}, Skip: ${skipCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await juricaSource.close();
  return true;
}

main();
