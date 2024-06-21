const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const ms = require('ms');

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

async function main() {
  try {
    await patch();
  } catch (e) {
    console.error('patch error', e);
  }
  setTimeout(end, ms('1s'));
}

async function patch() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  let decision;
  const cursor = await decisions.find({ sourceName: 'jurica', dateCreation: /^2024-06-2/ });
  while ((decision = await cursor.next())) {
    let changed = false;
    let parties = [];
    for (let i = 0; i < decision.parties.length; i++) {
      if (
        decision.parties[i].attributes === undefined &&
        decision.parties[i].qualitePartie &&
        decision.parties[i].typePersonne
      ) {
        changed = true;
        parties.push({
          attributes: {
            qualitePartie: decision.parties[i].qualitePartie,
            typePersonne: decision.parties[i].typePersonne,
          },
          identite: decision.parties[i].identite,
        });
      }
    }
    if (changed === true) {
      decision.parties = parties;
      decision.labelStatus = 'toBeTreated';
      await decisions.replaceOne({ _id: decision._id }, decision);
    }
  }
  await cursor.close();
  await client.close();
  return true;
}

main();
