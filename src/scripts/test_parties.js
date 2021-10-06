const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const parser = require('fast-xml-parser');

const parserOptions = {
  attributeNamePrefix: '',
  attrNodeName: 'attributes',
  textNodeName: 'value',
  ignoreAttributes: false,
  ignoreNameSpace: true,
  allowBooleanAttributes: false,
  parseNodeValue: false,
  parseAttributeValue: false,
  trimValues: true,
  cdataTagName: false,
  parseTrueNumberOnly: false,
  arrayMode: true,
  trimValues: true,
};

const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const rawDocument = await rawJurica.findOne({ _id: 2437803 });
  const xml = `<document>${rawDocument.JDEC_COLL_PARTIES}</document>`;

  console.log(xml);

  const valid = parser.validate(xml);
  if (valid === true) {
    const json = parser.parse(xml, parserOptions);
    console.log(JSON.stringify(json.document[0].partie, null, 2));
  } else {
    console.error('invalid xml', valid);
  }

  await client.close();
  return true;
}

main();
