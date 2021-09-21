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
  console.log('OpenJustice - Start "reimport" job:', new Date().toLocaleString());
  try {
    // Get last month:
    await reimportJurinet(1);
  } catch (e) {
    console.error('Jurinet reimport error', e);
  }
  try {
    // Get last month:
    await reimportJurica(1);
  } catch (e) {
    console.error('Jurica reimport error', e);
  }
  console.log('OpenJustice - End "reimport" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function reimportJurinet(n) {
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
  let wincicaCount = 0;

  console.log(`Get last ${n} month(s) decisions from Jurinet...`);
  const jurinetResult = await jurinetSource.getLastNMonth(n);

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
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
          row._indexed = null;
          await rawJurinet.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
          updateCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
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
    `Done Reimporting ${n} month(s) of Jurinet - New: ${newCount}, Update: ${updateCount}, Normalized: ${normalizedCount}, WinciCA: ${wincicaCount}, Skip: ${skipCount}, Error: ${errorCount}).`,
  );

  await client.close();
  await jurinetSource.close();
  return true;
}

async function reimportJurica(n) {
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
  let updateCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let normalizedCount = 0;
  let duplicateCount = 0;

  console.log(`Get last ${n} month(s) decisions from Jurica...`);
  // NOT ENOUGH MEMORY: const juricaResult = await juricaSource.getLastNMonth(n);
  const juricaResult = await juricaSource.getBatch({
    offset: 0,
    limit: 200,
    order: 'DESC',
    onlyTreated: false,
  });

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          newCount++;

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
              normalizedCount++;
            } else {
              let normDec = await JuricaUtils.Normalize(row, normalized, true);
              normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
              normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
              normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
              normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
              normDec._version = decisionsVersion;
              await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
                bypassDocumentValidation: true,
              });
              normalizedCount++;
            }
          } else {
            duplicateCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        try {
          row._indexed = null;
          await rawJurica.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
          updateCount++;

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
              normalizedCount++;
            } else {
              let normDec = await JuricaUtils.Normalize(row, normalized, true);
              normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
              normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
              normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
              normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
              normDec._version = decisionsVersion;
              await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
                bypassDocumentValidation: true,
              });
              normalizedCount++;
            }
          } else {
            duplicateCount++;
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Reimporting ${n} month(s) of Jurica - New: ${newCount}, Update: ${updateCount}, Normalized: ${normalizedCount}, Duplicate: ${duplicateCount}, Skip: ${skipCount}, Error: ${errorCount}).`,
  );

  await client.close();
  await juricaSource.close();
  return true;
}

main();
