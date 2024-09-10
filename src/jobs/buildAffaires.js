const limit = 100;
const sort = -1;

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
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
  console.log('OpenJustice - Start "buildAffaires" job:', new Date().toLocaleString());
  const path = require('path');
  const fs = require('fs');
  const { JuricaUtils } = require('../jurica-utils');
  const { JurinetUtils } = require('../jurinet-utils');
  const oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

  // Switch to "Thick Mode" (because Jurica uses an archaic version of Oracle, cf. https://node-oracledb.readthedocs.io/en/latest/user_guide/initialization.html#enabling-node-oracledb-thick-mode-on-linux-and-related-platforms):
  oracledb.initOracleClient();

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

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI);
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');

  const DBSDERConnection = new MongoClient(process.env.MONGO_URI);
  await DBSDERConnection.connect();
  const DBSDERClient = DBSDERConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = DBSDERClient.collection('rawJurinet');
  const rawJurica = DBSDERClient.collection('rawJurica');

  // Ensure more indexes:
  /*
  await rawJurinet.createIndex({ IND_ANO: 1, TYPE_ARRET: -1 });
  await rawJurica.createIndex({ JDEC_NUM_RG: 1, JDEC_JURIDICTION: 1, JDEC_DATE: -1 });
  */

  // First pass : Jurinet
  let total = 0;
  let incompleteCount = 0;
  let noAffaire = 0;
  let noDecatt = 0;
  let decattNotFound = 0;
  let decattFound = 0;
  let offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  const countJurinet = await rawJurinet.countDocuments({ TYPE_ARRET: 'CC' });

  let hasDoc = false;
  try {
    let doc;
    let cursor = await rawJurinet.find({ TYPE_ARRET: 'CC' }).sort({ _id: sort }).skip(offset).limit(limit);
    while ((doc = await cursor.next())) {
      hasDoc = true;
      offset++;
      total++;
      console.log(`(buildAffaires) processing Jurinet ${doc._id}...`);
      const res = await JurinetUtils.IndexAffaire(
        doc,
        jIndexMain,
        jIndexAffaires,
        rawJurica,
        jurinetConnection,
        grcomConnection,
      );
      console.log(`(buildAffaires) Jurinet ${doc._id} done: ${res}.`);
      switch (res) {
        case 'decatt-found':
          decattFound++;
          break;
        case 'decatt-not-found':
          decattNotFound++;
          break;
        case 'no-decatt':
          noDecatt++;
          break;
        case 'no-affaire':
          noAffaire++;
          break;
        case 'no-data':
          incompleteCount++;
          break;
      }
    }
    await cursor.close();
  } catch (e) {
    console.error(e);
  }

  if (hasDoc === false) {
    offset = 0;
  }
  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset'), `${offset}`);

  console.log({
    source: 'jurinet',
    range: `${offset - limit}-${offset} / ${countJurinet}`,
    progress: `${((offset / countJurinet) * 100).toFixed(1)}%`,
    processed: total,
    incomplete: `${incompleteCount} (${((incompleteCount / total) * 100).toFixed(1)}%)`,
    decattNotFound: `${decattNotFound} (${((decattNotFound / total) * 100).toFixed(1)}%)`,
    decattFound: `${decattFound} (${((decattFound / total) * 100).toFixed(1)}%)`,
    noAffaire: `${noAffaire} (${((noAffaire / total) * 100).toFixed(1)}%)`,
    noDecatt: `${noDecatt} (${((noDecatt / total) * 100).toFixed(1)}%)`,
  });

  // Second pass : Jurica

  total = 0;
  incompleteCount = 0;
  decattFound = 0;
  noDecatt = 0;
  offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurica.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  const countJurica = await rawJurica.countDocuments({});

  hasDoc = false;
  try {
    let doc = null;
    let cursor = await rawJurica.find({}).sort({ _id: sort }).skip(offset).limit(limit);
    while ((doc = await cursor.next())) {
      hasDoc = true;
      offset++;
      total++;
      console.log(`(buildAffaires) processing Jurica ${doc._id}...`);
      const res = await JuricaUtils.IndexAffaire(doc, jIndexMain, jIndexAffaires, jurinetConnection);
      console.log(`(buildAffaires) Jurica ${doc._id} done: ${res}.`);
      switch (res) {
        case 'decatt-found':
          decattFound++;
          break;
        case 'no-decatt':
          noDecatt++;
          break;
        case 'no-data':
          incompleteCount++;
          break;
      }
    }
    await cursor.close();
  } catch (e) {
    console.error(e);
  }

  if (hasDoc === false) {
    offset = 0;
  }
  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurica.offset'), `${offset}`);

  console.log({
    source: 'jurica',
    range: `${offset - limit}-${offset} / ${countJurica}`,
    progress: `${((offset / countJurica) * 100).toFixed(1)}%`,
    processed: total,
    incomplete: `${incompleteCount} (${((incompleteCount / total) * 100).toFixed(1)}%)`,
    decattFound: `${decattFound} (${((decattFound / total) * 100).toFixed(1)}%)`,
    noDecatt: `${noDecatt} (${((noDecatt / total) * 100).toFixed(1)}%)`,
  });

  await jurinetConnection.close();
  await juricaConnection.close();
  await grcomConnection.close();
  await DBSDERConnection.close();
  await jIndexConnection.close();

  console.log('OpenJustice - End "buildAffaires" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

main();
