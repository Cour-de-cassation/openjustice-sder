const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
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
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let newCount = 0;
  let errorCount = 0;
  let wincicaCount = 0;

  const jurinetResult = await jurinetSource.getNew();

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet');
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
            await jurinetSource.markAsImported(row._id);
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
            if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
              for (let d = 0; d < row._decatt.length; d++) {
                await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
              }
            }
          }
        } catch (e) {
          console.error(`Jurinet import error processing decision ${row._id}`, e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      }
    }
  }

  console.log(`Done Importing Jurinet - New: ${newCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`);
  await client.close();
  await jurinetSource.close();
  await juricaSource.close();
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
  let duplicateCount = 0;
  let nonPublicCount = 0;

  const juricaResult = await juricaSource.getNew();

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          let duplicate = false;
          let duplicateId = null;
          try {
            duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicateId = `jurinet:${duplicateId}`;
              duplicate = true;
            } else {
              duplicate = false;
            }
          } catch (e) {
            duplicate = false;
          }
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
          if (!row.JDEC_CODNAC || JuricaUtils.getPublicStatusFromNAC(row.JDEC_CODNAC) === true) {
            if (!row.JDEC_IND_DEC_PUB || parseInt(row.JDEC_IND_DEC_PUB, 10) !== 0) {
              if (duplicate === false) {
                let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
                if (normalized === null) {
                  let normDec = await JuricaUtils.Normalize(row);
                  normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
                  normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
                  normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
                  normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
                  normDec._version = decisionsVersion;
                  const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                  normDec._id = insertResult.insertedId;
                  await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions');
                  await juricaSource.markAsImported(row._id);
                  newCount++;
                }
              } else {
                await juricaSource.markAsImported(row._id);
                duplicateCount++;
              }
            } else {
              await juricaSource.markAsImported(row._id);
              nonPublicCount++;
            }
          } else {
            await juricaSource.markAsImported(row._id);
            nonPublicCount++;
          }
        } catch (e) {
          console.error(`Jurica import error processing decision ${row._id}`, e);
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Importing Jurica - New: ${newCount}, Non-public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await juricaSource.close();
  return true;
}

main();
