const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Juritools } = require('../juritools');
const { DateTime } = require('luxon');

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
  console.log(
    `OpenJustice - Start "reapplyCAFilter" script v20240301_1 on env ${process.env.NODE_ENV}:`,
    new Date().toLocaleString(),
  );
  try {
    await processJurica();
  } catch (e) {
    console.error('Jurica import error', e);
  }
  console.log('OpenJustice - End "reapplyCAFilter" script v20240301_1:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function processJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  let toDepublish = [];
  let errorCount = 0;
  let nonPublicCount = 0;
  let toBeControlledCount = 0;
  let row;
  const cursor = await rawJurica.find({ JDEC_CODNAC: { $ne: null } }, { allowDiskUse: true }).sort({ _id: -1 });
  while ((row = await cursor.next())) {
    try {
      let hadNormalized = true;
      let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
      if (normalized === null) {
        hadNormalized = false;
        let normDec = await JuricaUtils.Normalize(row);
        normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
        normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
        normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
        normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
        normDec.labelStatus = 'blocked';
        normDec.publishStatus = 'blocked';
        await decisions.insertOne(normDec, { bypassDocumentValidation: true });
        normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
        await JudilibreIndex.indexDecisionDocument(normalized, null, 'import in decisions during reapplyCAFilter');
      }
      const ShouldBeRejected = JuricaUtils.ShouldBeRejected(row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB);
      if (ShouldBeRejected) {
        console.warn(`reapplyCAFilter reject decision ${row._id}.`);
        await juricaSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJuricaDocument(row, null, 'non-public');
        nonPublicCount++;
        if (row._indexed === true && hadNormalized && normalized.labelStatus === 'exported') {
          toDepublish.push(row._id);
        }
        normalized.labelStatus = 'ignored_codeNACdeDecisionNonPublique';
        normalized.publishStatus = 'blocked';
        await decisions.replaceOne({ _id: normalized._id }, normalized, {
          bypassDocumentValidation: true,
        });
      } else {
        const ShouldBeSentToJudifiltre = JuricaUtils.ShouldBeSentToJudifiltre(
          row.JDEC_CODNAC,
          row.JDEC_CODNACPART,
          row.JDEC_IND_DEC_PUB,
        );
        if (ShouldBeSentToJudifiltre === true) {
          console.warn(`reapplyCAFilter decision ${row._id} to be controlled.`);
          await juricaSource.markAsImported(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, `IGNORED_CONTROLE_REQUIS`);
          const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id}` });
          if (existingDoc) {
            let dateJudifiltre = DateTime.now();
            existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
            await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
              bypassDocumentValidation: true,
            });
          }
          toBeControlledCount++;
          if (row._indexed === true && hadNormalized && normalized.labelStatus === 'exported') {
            toDepublish.push(row._id);
          }
          normalized.labelStatus = 'ignored_controleRequis';
          normalized.publishStatus = 'blocked';
          await decisions.replaceOne({ _id: normalized._id }, normalized, {
            bypassDocumentValidation: true,
          });
        } else {
        }
      }
    } catch (e) {
      console.error(`reapplyCAFilter error processing decision ${row._id}`, e);
      await juricaSource.markAsErroneous(row._id);
      await JudilibreIndex.updateJuricaDocument(row, null, null, e);
      errorCount++;
    }
  }

  /* @TODO PROCESS toDepublish */

  console.log(
    `Done processing Jurica - Non-Public: ${nonPublicCount}, To Be Controlled: ${toBeControlledCount}, To Depublish: ${toDepublish.length}, Error: ${errorCount}.`,
  );
  await cursor.close();
  await client.close();
  await juricaSource.close();
  return true;
}

main();
