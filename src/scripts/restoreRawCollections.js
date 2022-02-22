const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

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
  console.log('OpenJustice - Start "restoreRawCollections" job:', new Date().toLocaleString());

  try {
    await restoreJurinet();
  } catch (e) {
    console.error('Jurinet restore error', e);
  }

  try {
    await restoreJurica();
  } catch (e) {
    console.error('Jurica restore error', e);
  }

  console.log('OpenJustice - End "restoreRawCollections" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function restoreJurinet(n, resetContent) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  let totalCount = 0;
  let restoreCount = 0;
  let errorCount = 0;

  const query = `SELECT *
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.XML IS NOT NULL
        ORDER BY ${process.env.DB_TABLE}.ID_DOCUMENT ASC`;

  const result = await jurinetSource.connection.execute(query, [], {
    resultSet: true,
  });

  const rs = result.resultSet;

  while ((resultRow = await rs.getRow())) {
    const id = resultRow.ID_DOCUMENT;
    const raw = await rawJurinet.findOne({ _id: id });
    const normalized = await decisions.findOne({ sourceId: id, sourceName: 'jurinet' });
    if (raw === null && normalized !== null) {
      const row = await jurinetSource.buildRawData(resultRow, true);
      try {
        if (resultRow.AUT_ANO === 'LABEL' && resultRow.IND_ANO === 2) {
          row._indexed = true;
        } else {
          row._indexed = false;
        }
        await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
        await jurinetSource.markAsImported(row._id);
        restoreCount++;
      } catch (e) {
        console.error(e);
        await jurinetSource.markAsErroneous(row._id);
        errorCount++;
      }
    }
    totalCount++;
  }

  await rs.close();

  console.log(`Done restoring Jurinet - Restored: ${restoreCount}, Error: ${errorCount}, Total: ${totalCount}.`);

  await client.close();
  await jurinetSource.close();
  return true;
}

async function restoreJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let totalCount = 0;
  let restoreCount = 0;
  let errorCount = 0;

  const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        ORDER BY ${process.env.DB_TABLE_JURICA}.JDEC_ID ASC`;

  const result = await juricaSource.connection.execute(query, [], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let resultRow;

  while ((resultRow = await rs.getRow())) {
    const id = resultRow.JDEC_ID;
    const raw = await rawJurica.findOne({ _id: id });
    const normalized = await decisions.findOne({ sourceId: id, sourceName: 'jurica' });
    if (raw === null && normalized !== null) {
      const row = await juricaSource.buildRawData(resultRow, true);
      try {
        row._indexed = null;
        await rawJurica.insertOne(row, { bypassDocumentValidation: true });
        await juricaSource.markAsImported(row._id);
        restoreCount++;
      } catch (e) {
        console.error(e);
        await juricaSource.markAsErroneous(row._id);
        errorCount++;
      }
    }
    totalCount++;
  }

  await rs.close();

  console.log(`Done restoring Jurica - Restored: ${restoreCount}, Error: ${errorCount}, Total: ${totalCount}.`);

  await client.close();
  await juricaSource.close();
  return true;
}

main();
