const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetUtils } = require('../jurinet-utils');
const { JurinetOracle } = require('../jurinet-oracle');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

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
  console.log('OpenJustice - Start "test" job:', new Date().toLocaleString());
  try {
    await test();
  } catch (e) {
    console.error('test error', e);
  }
  console.log('OpenJustice - End "test" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function test() {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  // const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const doc = await rawJurinet.findOne({ _id: 1722740 });

  try {
    let cleanedXml = JurinetUtils.CleanXML(doc.XMLA);
    cleanedXml = JurinetUtils.XMLToJSON(cleanedXml, {
      filter: false,
      htmlDecode: true,
      toLowerCase: true,
    });
    require('fs').writeFileSync('test.log', cleanedXml.texte_arret);
    console.log(/\x92/gm.test(cleanedXml.texte_arret));
  } catch (e) {
    console.error(e);
  }

  await jurinetSource.close();
  await client.close();
  return true;
}

main();
