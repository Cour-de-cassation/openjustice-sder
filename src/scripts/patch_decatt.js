const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const { JuricaOracle } = require('../jurica-oracle');
const { JurinetOracle } = require('../jurinet-oracle');
const ms = require('ms');

let missingCount = 0;
let diffCount = 0;
let sameCount = 0;
let noneCount = 0;

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
  console.log(`${missingCount} missing decatt.`);
  console.log(`${diffCount} different decatt.`);
  console.log(`${sameCount} same decatt.`);
  console.log(`${noneCount} no decatt.`);
  process.exit(code);
}

async function main() {
  try {
    await patch();
  } catch (e) {
    console.error('patch error', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch() {
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

  let rawJurinetDocument;
  // let lines = fs.readFileSync(path.join(__dirname, 'decatt_to_check.txt')).toString().split('\n');
  const rawJurinetCursor = await rawJurinet.find(
    { TYPE_ARRET: 'CC' },
    {
      allowDiskUse: true,
      fields: {
        _id: 1,
        _decatt: 1,
      },
    },
  );

  while ((rawJurinetDocument = await rawJurinetCursor.next())) {
    //   for (let i = 0; i < lines.length; i++) {
    // if (/different decatt .* for \d+/i.test(lines[i])) {
    // let id = parseInt(/different decatt .* for (\d+)/i.exec(lines[i])[1], 10);
    // rawJurinetDocument = await rawJurinet.findOne({ _id: id });
    let decatt = null;
    try {
      let decattInfo = await jurinetSource.getDecatt(rawJurinetDocument._id);
      decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
    } catch (e) {}
    let hasPreviousDecatt =
      rawJurinetDocument._decatt && Array.isArray(rawJurinetDocument._decatt) && rawJurinetDocument._decatt.length > 0;
    let hasNewDecatt = decatt && Array.isArray(decatt) && decatt.length > 0;

    if (!decatt || (Array.isArray(decatt) && decatt.length === 0)) {
      noneCount++;
    }

    if (!hasPreviousDecatt && hasNewDecatt) {
      // console.log('Missing decatt', decatt, 'for', rawJurinetDocument._id);
      missingCount++;
    } else if (hasPreviousDecatt && JSON.stringify(decatt) !== JSON.stringify(rawJurinetDocument._decatt)) {
      if (
        Array.isArray(decatt) &&
        Array.isArray(rawJurinetDocument._decatt) &&
        (decatt.indexOf(rawJurinetDocument._decatt[0]) !== -1 || rawJurinetDocument._decatt.indexOf(decatt[0]) !== -1)
      ) {
        sameCount++;
      } else {
        console.log(
          'Different decatt',
          JSON.stringify(decatt),
          'for',
          rawJurinetDocument._id,
          ' - previous was: ',
          JSON.stringify(rawJurinetDocument._decatt),
        );
        diffCount++;
      }
    } else {
      sameCount++;
    }
    // }
  }

  await client.close();
  await jurinetSource.close();
  await juricaSource.close();
  return true;
}

main();
