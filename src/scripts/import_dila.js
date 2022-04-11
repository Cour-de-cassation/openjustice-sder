const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { parentPort } = require('worker_threads');
const ms = require('ms');

const SRC_DIRS = {
  RAW: path.join(__dirname, '..', 'jobs', 'data', 'DILA_CAPP_raw'),
  NORM: path.join(__dirname, '..', 'jobs', 'data', 'DILA_CAPP_normalized'),
};

let selfKill = setTimeout(cancel, ms('24h'));

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

async function store(source) {
  const { MongoClient } = require('mongodb');
  const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawDila = database.collection(process.env.MONGO_DILA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let newCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  const basePath = SRC_DIRS[source];
  const files = fs.readdirSync(basePath);

  for (let i = 0; i < files.length; i++) {
    if (files[i].indexOf('.json') !== -1) {
      try {
        const documentToStore = JSON.parse(fs.readFileSync(path.join(basePath, files[i])).toString());
        let existing;
        switch (source) {
          case 'RAW':
            existing = await rawDila.findOne({ _id: documentToStore._id });
            if (existing === null) {
              await rawDila.insertOne(documentToStore, { bypassDocumentValidation: true });
              newCount++;
            } else {
              skipCount++;
            }
            break;
          case 'NORM':
            existing = await decisions.findOne({ sourceId: documentToStore._id, sourceName: 'dila' });
            if (existing === null) {
              documentToStore._version = decisionsVersion;
              await decisions.insertOne(documentToStore, { bypassDocumentValidation: true });
              newCount++;
            } else {
              skipCount++;
            }
            break;
        }
      } catch (e) {
        console.error(e);
        errorCount++;
      }
    }
  }

  await client.close();

  console.log(`Source ${source} - new: ${newCount}, skip: ${skipCount}, error: ${errorCount}.`);
}

async function storeDila() {
  for (let source in SRC_DIRS) {
    console.log(`Processing source ${source}...`);
    try {
      await store(source);
    } catch (e) {
      console.error(source, e);
    }
    console.log(`Source ${source} done.`);
  }
  console.log(`All done.`);
  setTimeout(end, ms('1s'));
}

storeDila();
