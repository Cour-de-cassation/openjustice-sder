const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
// const { JurinetOracle } = require('../jurinet-oracle');
// const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
const ms = require('ms');

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
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);

  let jurinetDoc;
  const jurinetCursor = await rawJurinet.find({}, { allowDiskUse: true }).limit(1000);
  while ((jurinetDoc = await jurinetCursor.next())) {
    let oldText, newText;
    try {
      oldText = cleanOld(jurinetDoc['XML']);
    } catch (e) {
      console.log(jurinetDoc._id, e);
    }
    try {
      newText = cleanNew(jurinetDoc['XML']);
    } catch (e) {
      console.log(jurinetDoc._id, e);
    }
    if (oldText !== newText) {
      console.log(jurinetDoc._id, 'NOT OK');
      const diff = Diff.diffChars(oldText, newText);

      diff.forEach((part) => {
        const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        process.stderr.write(part.value[color]);
      });

      console.log();
    } else {
      console.log(jurinetDoc._id, 'OK');
    }
  }
  await client.close();
}

function cleanOld(xml) {
  // <TEXTE_ARRET> splitting and removing:
  const fragments = xml.split(/<\/?texte_arret>/gi);

  if (fragments.length < 3) {
    throw new Error(
      'JurinetUtils.CleanXML: <TEXTE_ARRET> tag not found or incomplete: the document could be malformed or corrupted.',
    );
  }

  xml = xml.replace(/<texte_arret>[\s\S]*<\/texte_arret>/gim, '');

  // Cleaning of every <TEXTE_ARRET> fragment:
  const texteArret = [];
  for (let j = 0; j < fragments.length; j++) {
    if ((j % 2 !== 0 || j > 1) && j < fragments.length - 1) {
      // There could be some (useless) HTML tags to remove:
      fragments[j] = fragments[j].replace(/<br\s*\/>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<hr\s*\/>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<a\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<b\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<i\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<u\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<em\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<strong\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<font\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<span\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<p\s+[^>]+>/gim, '');
      fragments[j] = fragments[j].replace(/<h\d\s+[^>]+>/gim, '');

      fragments[j] = fragments[j].replace(/<\/a>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/b>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/i>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/u>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/em>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/strong>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/font>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/span>/gim, ' ');
      fragments[j] = fragments[j].replace(/<\/p>/gim, '\r\n');
      fragments[j] = fragments[j].replace(/<\/h\d>/gim, '\r\n');

      fragments[j] = fragments[j].replace(/\t/gim, '');
      fragments[j] = fragments[j].replace(/\\t/gim, '');
      fragments[j] = fragments[j].replace(/\f/gim, '');
      fragments[j] = fragments[j].replace(/\\f/gim, '');
      fragments[j] = fragments[j].replace(/\r\n/gim, '\n');
      fragments[j] = fragments[j].replace(/\r/gim, '\n');
      fragments[j] = fragments[j].replace(/  +/gm, ' ');

      // Minimal set of entities for XML validation:
      fragments[j] = fragments[j]
        .replace(/&/g, '&amp;')
        .replace(/&amp;amp;/g, '&amp;')
        .replace(/&amp;#/g, '&#');
      fragments[j] = fragments[j].replace(/</g, '&lt;');
      fragments[j] = fragments[j].replace(/>/g, '&gt;');
      fragments[j] = fragments[j].trim();

      // Ignore empty fragment:
      if (fragments[j].length > 0) {
        texteArret.push(fragments[j]);
      }
    }
  }

  // Cleaning the rest of the document:
  xml = xml
    .replace(/&/g, '&amp;')
    .replace(/&amp;amp;/g, '&amp;')
    .replace(/&amp;#/g, '&#');
  xml = xml.replace(/\s<\s/g, ' &lt; ');
  xml = xml.replace(/\s>\s/g, ' &gt; ');

  // Bad XML, bad JSON...
  xml = xml.replace(/<\/numpourvoi><numpourvoi\s+id=\"\d+\">/gim, ',');

  // Reinject the merged <TEXTE_ARRET> element(s):
  if (xml.indexOf('</CAT_PUB>') !== -1) {
    xml = xml.replace('</CAT_PUB>', '</CAT_PUB><TEXTE_ARRET>' + texteArret.join(' ').trim() + '</TEXTE_ARRET>');
    xml = xml.trim();
  } else {
    throw new Error(
      'JurinetUtils.CleanXML: End of <CAT_PUB> tag not found: the document could be malformed or corrupted.',
    );
  }

  return xml;
}

function cleanNew(text) {
  // There could be more than one <TEXTE_ARRET> tags, so we first split the text around them:
  const fragments = text.split(/<\/?texte_arret>/gi);

  if (fragments.length < 3) {
    throw new Error(
      'jurinetLib.cleanText: <TEXTE_ARRET> tag not found or incomplete, the document could be malformed or corrupted.',
    );
  }

  // Keep this info for later:
  const textNextToCatPub = text.indexOf('</CAT_PUB><TEXTE_ARRET>') !== -1;

  // Remove all <TEXT_ARRET> fragments from the text:
  text = text.replace(/<texte_arret>[\s\S]*<\/texte_arret>/gim, '');

  // Cleaning every <TEXTE_ARRET> fragment:
  const mergedText = [];

  for (let j = 0; j < fragments.length; j++) {
    if ((j % 2 !== 0 || j > 1) && j < fragments.length - 1) {
      // Remove HTML tags:
      fragments[j] = fragments[j].replace(/<\/?[^>]+(>|$)/gm, '');

      // Handling newlines and carriage returns:
      fragments[j] = fragments[j].replace(/\r\n/gim, '\n');
      fragments[j] = fragments[j].replace(/\r/gim, '\n');

      // Remove extra spaces:
      fragments[j] = fragments[j].replace(/\t/gim, '');
      fragments[j] = fragments[j].replace(/\\t/gim, ''); // That could happen...
      fragments[j] = fragments[j].replace(/\f/gim, '');
      fragments[j] = fragments[j].replace(/\\f/gim, ''); // That could happen too...
      fragments[j] = fragments[j].replace(/  +/gm, ' ').trim();

      // Minimal set of entities for XML validation:
      fragments[j] = fragments[j]
        .replace(/&/g, '&amp;')
        .replace(/&amp;amp;/g, '&amp;')
        .replace(/&amp;#/g, '&#');
      fragments[j] = fragments[j].replace(/</g, '&lt;');
      fragments[j] = fragments[j].replace(/>/g, '&gt;');

      // Ignore empty fragment:
      if (fragments[j].length > 0) {
        mergedText.push(fragments[j]);
      }
    }
  }

  // Cleaning the rest of the text:
  text = text
    .replace(/&/g, '&amp;')
    .replace(/&amp;amp;/g, '&amp;')
    .replace(/&amp;#/g, '&#');
  text = text.replace(/\s<\s/g, ' &lt; ');
  text = text.replace(/\s>\s/g, ' &gt; ');

  // A bad XML could lead to a bad JSON (the related data does not matter):
  text = text.replace(/<\/numpourvoi><numpourvoi\s+id=\"\d+\">/gim, ',');

  // Reinject the merged <TEXTE_ARRET> fragments:
  if (textNextToCatPub === true) {
    text = text
      .replace('</CAT_PUB>', '</CAT_PUB><TEXTE_ARRET>' + mergedText.join(' ').trim() + '</TEXTE_ARRET>')
      .trim();
  } else if (text.indexOf('</LIEN_WWW>') !== -1) {
    text = text
      .replace('</LIEN_WWW>', '</LIEN_WWW><TEXTE_ARRET>' + mergedText.join(' ').trim() + '</TEXTE_ARRET>')
      .trim();
  } else {
    throw new Error(
      'jurinetLib.cleanText: End of <CAT_PUB> or <LIEN_WWW> tag not found, the document could be malformed or corrupted.',
    );
  }

  return text;
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
