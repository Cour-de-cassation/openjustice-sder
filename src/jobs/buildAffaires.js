const limit = 100;
const sort = 1;

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
  const { DateTime } = require('luxon');
  const { Juritools } = require('../juritools');
  const { JudilibreIndex } = require('../judilibre-index');
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

  const { MongoClient, ObjectID } = require('mongodb');

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
    useUnifiedTopology: true,
  });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');

  // Ensure indexes:
  await jIndexAffaires.createIndex({ numbers: 1 });
  await jIndexAffaires.createIndex({ ids: 1 });
  await jIndexAffaires.createIndex({ affaires: 1 });
  await jIndexAffaires.createIndex({ dates: 1 });
  await jIndexAffaires.createIndex({ jurisdictions: 1 });
  await jIndexAffaires.createIndex({ _id: 1, numbers: 1 });
  await jIndexAffaires.createIndex({ _id: 1, ids: 1 });
  await jIndexAffaires.createIndex({ _id: 1, affaires: 1 });
  await jIndexAffaires.createIndex({ _id: 1, dates: 1 });
  await jIndexAffaires.createIndex({ _id: 1, jurisdictions: 1 });

  // _id : specific ID (mongo ObjectId())
  // numbers: array of numbers (RG, pourvoi, etc.)
  // ids: array of decision ids (jurinet, jurica, etc.)
  // affaires: array of ID_AFFAIRE (GPCIV.AFF, GPCIV.DECATT)
  // dates: array of decision dates
  // jurisdictions: array of decision jurisdictions
  // numbers_ids: mapping number <-> decision ID (e.g. 'U8121289' -> 'jurinet:1784323')
  // numbers_affaires: mapping number <-> affaire ID (e.g. 'U8121289' -> 11122154)
  // numbers_dates: mapping number <-> date (e.g. 'U8121289' -> '2018-07-12')
  // numbers_jurisdictions: mapping number <-> jurisdiction (e.g. '09/01206' -> 'Cour d'appel de Caen')
  // dates_jurisdictions: mapping date <-> jurisdiction (e.g. '2018-07-12' -> 'Conseil de prud'hommes de Caen') <-- required because some dependencies don't have a recognizable number

  const DBSDERConnection = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await DBSDERConnection.connect();
  const DBSDERClient = DBSDERConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = DBSDERClient.collection('rawJurinet');
  const rawJurica = DBSDERClient.collection('rawJurica');

  // Ensure more indexes:
  await rawJurinet.createIndex({ IND_ANO: 1, TYPE_ARRET: -1 });
  await rawJurica.createIndex({ JDEC_NUM_RG: 1, JDEC_JURIDICTION: 1, JDEC_DATE: -1 });

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
  let doc;
  let cursor = await rawJurinet.find({ TYPE_ARRET: 'CC' }).sort({ _id: sort }).skip(offset).limit(limit);
  while ((doc = await cursor.next())) {
    offset++;
    total++;
    const res = await JurinetUtils.IndexAffaire(
      doc,
      jIndexMain,
      jIndexAffaires,
      rawJurica,
      jurinetConnection,
      grcomConnection,
    );
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

  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset'), `${offset}`);

  console.log({
    range: `${offset - limit}-${offset}`,
    source: 'jurinet',
    total: total,
    incompleteCount: incompleteCount,
    decattNotFound: decattNotFound,
    decattFound: decattFound,
    noAffaire: noAffaire,
    noDecatt: noDecatt,
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
  doc = null;
  cursor = await rawJurica.find({}).sort({ _id: sort }).skip(offset).limit(limit);
  while ((doc = await cursor.next())) {
    offset++;
    total++;
    const res = await JuricaUtils.IndexAffaire(doc, jIndexMain, jIndexAffaires, jurinetConnection);
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

  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurica.offset'), `${offset}`);

  console.log({
    range: `${offset - limit}-${offset}`,
    source: 'jurica',
    total: total,
    incompleteCount: incompleteCount,
    decattFound: decattFound,
    noDecatt: noDecatt,
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
