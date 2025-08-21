const limit = 100;
const sort = -1;

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
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
  console.log('OpenJustice - Start "buildAffaires" job:', new Date().toLocaleString());
  const path = require('path');
  const fs = require('fs');
  const { JuricaUtils } = require('../jurica-utils');
  const { JurinetUtils } = require('../jurinet-utils');
  const oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  const jurinetConnection = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    connectString: process.env.DB_HOST,
  });
  const juricaConnection = await oracledb.getConnection({
    user: process.env.DB_USER_JURICA,
    password: process.env.DB_PASS_JURICA,
    connectString: process.env.DB_HOST_JURICA,
  });
  const grcomConnection = await oracledb.getConnection({
    user: process.env.GRCOM_DB_USER,
    password: process.env.GRCOM_DB_PASS,
    connectString: process.env.DB_HOST,
  });
  const { MongoClient } = require('mongodb');
  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexAffaires = jIndexClient.collection('affaires');
  const DBSDERConnection = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await DBSDERConnection.connect();
  const DBSDERClient = DBSDERConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = DBSDERClient.collection('rawJurinet');
  const rawJurica = DBSDERClient.collection('rawJurica');
  const decisions = DBSDERClient.collection('decisions');

  // First pass : Jurinet
  let offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  console.log('First pass : Jurinet with offset ', offset);
  let hasDoc = false;
  try {
    let doc;
    let cursor = await rawJurinet.find({ TYPE_ARRET: 'CC' }).sort({ _id: sort }).skip(offset).limit(limit);
    while ((doc = await cursor.next())) {
      hasDoc = true;
      offset++;
      await JurinetUtils.IndexAffaire(doc, jIndexAffaires, rawJurica, jurinetConnection, grcomConnection, decisions);
    }
    await cursor.close();
  } catch (e) {
    console.error(e);
  }
  if (hasDoc === false) {
    offset = 0;
  }
  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset'), `${offset}`);

  // Second pass : Jurica
  offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurica.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  console.log('Second pass : Jurica with offset ', offset);
  hasDoc = false;
  try {
    let doc = null;
    let cursor = await rawJurica.find({}).sort({ _id: sort }).skip(offset).limit(limit);
    while ((doc = await cursor.next())) {
      hasDoc = true;
      offset++;
      await JuricaUtils.IndexAffaire(doc, jIndexAffaires, jurinetConnection, decisions);
    }
    await cursor.close();
  } catch (e) {
    console.error(e);
  }
  if (hasDoc === false) {
    offset = 0;
  }
  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurica.offset'), `${offset}`);

  await jurinetConnection.close();
  await juricaConnection.close();
  await grcomConnection.close();
  await DBSDERConnection.close();
  await jIndexConnection.close();
  console.log('OpenJustice - End "buildAffaires" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

main();
