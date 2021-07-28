const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetUtils } = require('../jurinet-utils');
const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

let selfKill = setTimeout(cancel, ms('5h'));

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
  console.log('OpenJustice - Start "manual" job:', new Date().toLocaleString());
  try {
    await processJurinet('loaded');
  } catch (e) {
    console.error('processJurinet(loaded) error', e);
  }
  try {
    await processJurinet('toBeTreated');
  } catch (e) {
    console.error('processJurinet(toBeTreated) error', e);
  }
  console.log('OpenJustice - End "manual" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function processJurinet(status) {
  console.log(`Process Jurinet / ${status}...`);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let cont = true;
  let skip = 0;
  let document;
  let updated = 0;
  let skipped = 0;
  while (cont === true) {
    const cursor = await decisions
      .find({ sourceName: 'jurinet', labelStatus: status }, { allowDiskUse: true })
      .skip(skip)
      .sort({ sourceId: -1 })
      .limit(100);
    let hasData = false;
    while (cont && (document = await cursor.next())) {
      hasData = true;
      const raw = await rawJurinet.findOne({ _id: document.sourceId });
      let newDecatt;
      try {
        const decattInfo = await jurinetSource.getDecatt(document.sourceId);
        const decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
        newDecatt = decatt;
      } catch (e) {
        newDecatt = null;
      }
      try {
        const reNormalized = await JurinetUtils.Normalize(raw, document, true);
        if (
          JSON.stringify(document.occultation) !== JSON.stringify(reNormalized.occultation) ||
          document.originalText.length > reNormalized.originalText.length ||
          JSON.stringify(document.decatt) !== JSON.stringify(newDecatt)
        ) {
          document._rev = reNormalized._rev;
          if (JSON.stringify(document.occultation) !== JSON.stringify(reNormalized.occultation)) {
            document.occultation = reNormalized.occultation;
          }
          if (document.originalText.length > reNormalized.originalText.length) {
            document.originalText = reNormalized.originalText;
          }
          if (JSON.stringify(document.decatt) !== JSON.stringify(newDecatt)) {
            document.decatt = newDecatt;
          }
          document.originalText = JurinetUtils.removeMultipleSpace(document.originalText);
          document.originalText = JurinetUtils.replaceErroneousChars(document.originalText);
          await decisions.replaceOne({ _id: document._id }, document, {
            bypassDocumentValidation: true,
          });
          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        skipped++;
      }
    }
    cont = hasData;
    skip += 100;
  }
  await juricaSource.close();
  await jurinetSource.close();
  await client.close();
  console.log(`Jurinet / ${status} done - updated: ${updated}, skipped: ${skipped}`);
  return true;
}

main();
