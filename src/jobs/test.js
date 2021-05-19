const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
// const { JurinetOracle } = require('../jurinet-oracle');
// const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const ms = require('ms');
const he = require('he');

require('colors');
const Diff = require('diff');

let selfKill = setTimeout(cancel, ms('1h'));

function end() {
  if (parentPort) parentPort.postMessage('done');
  setTimeout(kill, ms('1s'), 0);
}

function cancel() {
  if (parentPort) parentPort.postMessage('cancelled');
  setTimeout(kill, ms('1s'), 1);
}

function kill(code) {
  clearTimeout(selfKill);
  process.exit(code);
}

async function main() {
  try {
    // await testJurinet();
    // await testDila();
    // await testDoublon();
    // await testPortalis();
    await testClean();
  } catch (e) {
    console.error('Test error', e);
  }
  setTimeout(end, ms('1s'));
}

async function testClean() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURICA_COLLECTION);

  let jurinetDoc;
  const jurinetCursor = await rawJurinet.find({}, { allowDiskUse: true }).sort({ _id: -1 }).limit(1000);
  while ((jurinetDoc = await jurinetCursor.next())) {
    let oldText, newText;
    try {
      oldText = cleanOld(jurinetDoc['JDEC_HTML_SOURCE']);
    } catch (e) {
      // console.log(jurinetDoc._id, e);
    }
    try {
      newText = cleanNew(jurinetDoc['JDEC_HTML_SOURCE']);
    } catch (e) {
      // console.log(jurinetDoc._id, e);
    }
    if (oldText !== newText) {
      console.log(jurinetDoc._id);
      const diff = Diff.diffChars(oldText, newText);
      diff.forEach((part) => {
        const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        if (color !== 'grey') process.stderr.write(part.value[color]);
      });
      console.log();
    } else {
      // console.log(jurinetDoc._id, 'OK');
    }
  }
  await client.close();
}

function cleanOld(html) {
  html = html.replace(/<\/?[^>]+(>|$)/gm, '');
  html = html.replace(/\t/gim, '');
  html = html.replace(/\\t/gim, '');
  html = html.replace(/\f/gim, '');
  html = html.replace(/\\f/gim, '');
  return he.decode(html).trim();
}

function cleanNew(text) {
  // Remove HTML tags:
  html = html.replace(/<\/?[^>]+(>|$)/gm, '');
  // Handling newlines and carriage returns:
  html = html.replace(/\r\n/gim, '\n');
  html = html.replace(/\r/gim, '\n');
  // Remove extra spaces:
  html = html.replace(/\t/gim, '');
  html = html.replace(/\\t/gim, ''); // That could happen...
  html = html.replace(/\f/gim, '');
  html = html.replace(/\\f/gim, ''); // That could happen too...
  html = html.replace(/  +/gm, ' ').trim();
  // Decode HTML entities:
  return he.decode(html);
}

/*
async function testPortalis() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

  let jurinetDoc;
  const jurinetCursor = await rawJurinet.find({ TYPE_ARRET: { $ne: 'CC' } }, { allowDiskUse: true });
  while ((jurinetDoc = await jurinetCursor.next())) {
    try {
      if (jurinetDoc['XML'] && jurinetDoc['XML'].indexOf('Portalis') !== -1) {
        // Strict :
        let portalis = /Portalis(?:\s+|\n+)(\b\S{4}-\S-\S{3}-(?:\s?|\n+)\S+\b)/g.exec(jurinetDoc['XML']);
        if (portalis === null) {
          // Less strict :
          portalis =
            /Portalis(?:\s*|\n*):?(?:\s+|\n+)(\b\S{2,4}(?:\s*)-(?:\s*)\S(?:\s*)-(?:\s*)\S{3}(?:\s*)-(?:\s*)(?:\s?|\n+)\S+\b)/g.exec(
              jurinetDoc['XML'],
            );
            if (portalis === null) {
              // Even less strict :
              portalis =
                /Portalis(?:\s*|\n*):?(?:\s+|\n+)(\b\S{2,4}(?:\s*)-(?:\s*)\S{3}(?:\s*)-(?:\s*)(?:\s?|\n+)\S+\b)/g.exec(
                  jurinetDoc['XML'],
                );
            }
        }
        portalis = portalis[1].replace(/\s/g, '').trim();
      }
    } catch (e) {
      console.log(jurinetDoc._id, jurinetDoc['XML']);
    }
  }
  await client.close();
}
*/

/*
async function testDoublon() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  let juricaData = [];
  let juricaDoc;
  const juricaCursor = await rawJurica.find({ JDEC_DATE: /^2021-04/ }, { allowDiskUse: true });
  while ((juricaDoc = await juricaCursor.next())) {
    juricaData.push(juricaDoc._id);
  }
  await client.close();

  for (let i = 0; i < juricaData.length; i++) {
    console.log(`Looking for a duplicate of ${juricaData[i]} (${i + 1}/${juricaData.length})`);
    let found = null;
    try {
      found = await JuricaUtils.GetJurinetDuplicate(juricaData[i]);
    } catch (e) {}
    if (found !== null) {
      console.log('...found:', found);
    }
  }
}
*/

/*
async function testDila() {
  const history = {};

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawDila = database.collection(process.env.MONGO_DILA_COLLECTION);

  let document;
  const cursor = await rawDila.find({}, { allowDiskUse: true });
  while ((document = await cursor.next())) {
    try {
      const year = document['DATE_DEC'].split('-')[0];
      if (typeof history[year] === 'undefined') {
        history[year] = 0;
      }
      history[year]++;
    } catch (e) {}
  }

  console.log(JSON.stringify(history, null, 2));

  await client.close();
}
*/

/*
async function testJurinet(n) {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const query = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.DT_ANO IS NOT NULL
        AND ${process.env.DB_TABLE}.IND_ANO = 2
        AND ${process.env.DB_TABLE}.XMLA IS NOT NULL
        AND ${process.env.DB_TABLE}.AUT_ANO = 'LABEL'
        AND ${process.env.DB_TABLE}.DT_ENVOI_DILA IS NULL
        ORDER BY ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} ASC`;

  const result = await jurinetSource.connection.execute(query, [], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let rows = [];
  let resultRow;

  while ((resultRow = await rs.getRow())) {
    rows.push(resultRow['ID_DOCUMENT']);
  }

  await rs.close();

  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  for (let i = 0; i < rows.length; i++) {
    let decision = await decisions.findOne({ sourceId: rows[i], sourceName: 'jurinet' });
    if (decision) {
      console.log(i, decision.sourceId, decision.dateDecision);
      try {
        await jurinetSource.reinject(decision);
      } catch (e) {
        console.error(e);
      }
    }
  }

  await jurinetSource.close();
  await client.close();

  return true;
}
*/

main();

/*
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { MongoClient } = require('mongodb');

async function testJurinet() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  console.log('Retrieve all "done" decisions for Jurinet...');
  let decision;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    console.log(decision.sourceId)
  }

  return true;
}

async function main() {
  console.log('OpenJustice - Start "test" job:', new Date().toLocaleString());
  try {
    await testJurinet();
  } catch (e) {
    console.error('Jurinet test error', e);
  }
  console.log('OpenJustice - End "test" job:', new Date().toLocaleString());
  setTimeout(end, 1000);
}

function end() {
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

main();
*/

/*
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { MongoClient } = require('mongodb');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  try {
    // Get last two months:
    await reimportJurinet(1);
  } catch (e) {
    console.error('Jurinet error', e);
  }
  process.exit(0);
}

async function reimportJurinet(n) {
  console.log('Setup DB Clients...');
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let normalizedCount = 0;

  console.log(`Get last ${n} months decisions from Jurinet...`);
  const jurinetResult = await jurinetSource.getLastNMonth(n, true);

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      if (row['AUT_CREATION'] !== 'WINCI') console.log(row['ID_DOCUMENT']);
    }
  }

  console.log(
    `Done (new: ${newCount}, update: ${updateCount}, normalized: ${normalizedCount}, skip: ${skipCount}, error: ${errorCount}).`,
  );
  console.log(`Teardown...`);

  // await client.close();
  await jurinetSource.close();
  return true;
}

main();
*/

/*
const { parentPort } = require('worker_threads');

async function main() {
  console.log('running test:', new Date().toLocaleString());
  setTimeout(end, 1000 * 60 * 10);
}

function end() {
  console.log('stopping test:', new Date().toLocaleString());
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

main();
*/

/*
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');

async function main() {
  console.log('OpenJustice - Start "test" job:', new Date().toLocaleString());
  try {
    await testJurinet();
  } catch (e) {
    console.error('Jurinet test error', e);
  }
  try {
    // await testJurica();
  } catch (e) {
    console.error('Jurica test error', e);
  }
  console.log('OpenJustice - End "test" job:', new Date().toLocaleString());
  setTimeout(end, 1000);
}

function end() {
  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
}

main();

async function testJurinet() {
  const jurinetSource = new JurinetOracle();
  const jurinetOrder = 'DESC';
  const jurinetBatch = 400;
  const jurinetOffset = 160;

  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: jurinetBatch,
    order: jurinetOrder,
    onlyTreated: false,
  });
  await jurinetSource.close();

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      if (row['TYPE_ARRET'] === 'CC') console.log(row['_id'], row['ID_CHAMBRE'], row['NUM_DECISION'], row['CAT_PUB'], row['DT_DECISION'], row['DT_CREATION']);
    }
  }

  return true;
}
*/
