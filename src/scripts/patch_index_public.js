const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { DateTime } = require('luxon');

const { parentPort } = require('worker_threads');
const { JudilibreIndex } = require('../judilibre-index');
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
  try {
    await patch();
  } catch (e) {
    console.error('patch index public', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch() {
  await JudilibreIndex.createIndex('mainIndex', { public: 1 });

  const result = await JudilibreIndex.find('mainIndex', { 'log.msg': /non-public/i });

  for (let i = 0; i < result.length; i++) {
    let indexedDoc = result[i];
    for (let j = 0; j < indexedDoc.log.length; j++) {
      if (/non-public/i.test(indexedDoc.log[j].msg)) {
        let dateJudifiltre = DateTime.fromJSDate(indexedDoc.log[j].date);
        console.log(dateJudifiltre.toISODate());
        indexedDoc.dateJudifiltre = dateJudifiltre.toISODate();
        indexedDoc.public = false;
      }
    }
    await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
      bypassDocumentValidation: true,
    });
  }

  return true;
}

main();
