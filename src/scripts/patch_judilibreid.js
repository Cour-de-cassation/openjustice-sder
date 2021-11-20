const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

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
    console.error('patch error', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch() {
  const result = await JudilibreIndex.find('mainIndex', { judilibreId: { $ne: null } });

  result.forEach(async (indexedDoc) => {
    if (typeof indexedDoc.judilibreId !== 'string') {
      indexedDoc.judilibreId = `${indexedDoc.judilibreId}`;
      indexedDoc.log.unshift({
        date: new Date(),
        msg: 'patch judilibreId',
      });
      await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
        bypassDocumentValidation: true,
      });
    }
  });

  return true;
}

main();
