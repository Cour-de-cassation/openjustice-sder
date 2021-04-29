const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { MongoClient } = require('mongodb');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  try {
    // Get last two months:
    await reimportJurinet(2);
  } catch (e) {
    console.error('Jurinet error', e);
  }
  process.exit(0);
}

async function reimportJurinet(n) {
  console.log('Setup DB Clients...');
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
  let updateCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let normalizedCount = 0;

  console.log(`Get last ${n} months decisions from Jurinet...`);
  const jurinetResult = await jurinetSource.getLastNMonth(n);

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec._version = decisionsVersion;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normalizedCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        try {
          await rawJurinet.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
          updateCount++;
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec._version = decisionsVersion;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normalizedCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done (new: ${newCount}, update: ${updateCount}, normalized: ${normalizedCount}, skip: ${skipCount}, error: ${errorCount}).`,
  );
  console.log(`Teardown...`);

  await client.close();
  await jurinetSource.close();
  return true;
}

main();
