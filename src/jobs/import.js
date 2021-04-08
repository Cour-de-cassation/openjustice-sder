const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  await importJurinet();
  await importJurica();
  return true;
}

async function importJurinet() {
  console.log('Setup DB Clients...');
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle({
    verbose: true,
  });
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
          // We only normalize, and insert into the 'decisions' collection, the documents that are
          // actually coming from the Cour de cassation (and not the ones from WinciCA):
          if (row['AUT_CREATION'] !== 'WINCI' && row['TYPE_ARRET'] === 'CC') {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            if (normalized === null) {
              let normDec = JurinetUtils.Normalize(row);
              normDec._version = decisionsVersion;
              await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              await jurinetSource.markAsImported(row._id);
              newCount++;
            } else {
              skipCount++;
            }
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        skipCount++;
      }
    }
  }

  console.log(`Done (new: ${newCount}, skip: ${skipCount}, error: ${errorCount}).`);
  console.log(`Teardown...`);

  await client.close();
  await jurinetSource.close();
  return true;
}

async function importJurica() {
  console.log('Setup DB Clients...');
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle({
    verbose: true,
  });
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
            let normDec = JuricaUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            await juricaSource.markAsImported(row._id);
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        skipCount++;
      }
    }
  }

  console.log(`Done (new: ${newCount}, skip: ${skipCount}, error: ${errorCount}).`);
  console.log(`Teardown...`);

  await client.close();
  await juricaSource.close();
  return true;
}

main();
