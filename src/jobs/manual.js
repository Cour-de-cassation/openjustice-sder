const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetUtils } = require('../jurinet-utils');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

let selfKill = setTimeout(cancel, ms('4h'));

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
    await processJurinet();
  } catch (e) {
    console.error('processJurinet error', e);
  }
  console.log('OpenJustice - End "manual" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function processJurinet() {
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
  while (cont === true) {
    const cursor = await decisions
      .find({ sourceName: 'jurinet', labelStatus: 'loaded' }, { allowDiskUse: true })
      .skip(skip)
      .sort({ sourceId: -1 })
      .limit(100);
    let hasData = false;
    while (cont && (document = await cursor.next())) {
      hasData = true;
      const raw = await rawJurinet.findOne({ _id: document.sourceId });
      const reNormalized = await JurinetUtils.Normalize(raw, document, true);
      if (
        JSON.stringify(document.occultation) !== JSON.stringify(reNormalized.occultation) ||
        document.originalText !== reNormalized.originalText
      ) {
        document._rev = reNormalized._rev;
        if (JSON.stringify(document.occultation) !== JSON.stringify(reNormalized.occultation)) {
          document.occultation = reNormalized.occultation;
        }
        if (document.originalText !== reNormalized.originalText) {
          document.originalText = reNormalized.originalText;
        }
        await decisions.replaceOne({ _id: document._id }, document, {
          bypassDocumentValidation: true,
        });
      }
    }
    cont = hasData;
    skip += 100;
  }

  await client.close();
  return true;
}

main();
