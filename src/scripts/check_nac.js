const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');
const { Juritools } = require('../juritools');

const ms = require('ms');

let selfKill = setTimeout(cancel, ms('12h'));

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
  console.log('OpenJustice - Start check NAC script:', new Date().toLocaleString());
  try {
    await checkNACJurica();
  } catch (e) {
    console.error('Jurica check NAC error', e);
  }
  console.log('OpenJustice - End check NAC job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function checkNACJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let TotalCount = 0;
  let NACCodeCount = 0;
  let NACCode = [];
  let decision;
  const cursor = await decisions.find(
    { sourceName: 'jurica' },
    {
      allowDiskUse: true,
    },
  );
  while ((decision = await cursor.next())) {
    TotalCount++;
    if (decision.NACCode !== null) {
      NACCodeCount++;
      if (NACCode.indexOf(decision.NACCode) === -1) {
        NACCode.push(decision.NACCode);
      }
    }
    console.log(
      `${((NACCodeCount / TotalCount) * 100).toFixed(2)}% (${NACCodeCount}/${TotalCount}) -${
        NACCode.length
      } different NAC codes`,
    );
  }

  console.log(
    `${((NACCodeCount / TotalCount) * 100).toFixed(2)}% (${NACCodeCount}/${TotalCount}) -${
      NACCode.length
    } different NAC codes`,
  );
  console.log(JSON.stringify(NACCode));
  await cursor.close();
  await client.close();
  return true;
}

main();
