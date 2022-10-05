const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');

const ids = [];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let document;
  const cursor = await rawJurinet.find(
    { IND_ANO: 2, DT_MODIF_ANO: null, AUT_ANO: { $ne: 'LABEL' }, _indexed: { $ne: null } },
    { allowDiskUse: true },
  );
  while ((document = await cursor.next())) {
    const decision = await decisions.findOne({ sourceName: 'jurinet', sourceId: document._id });
    if (decision && decision.pseudoText && /\w\s?[;.]$/gim.test(`${decision.pseudoText}`.trim()) === false) {
      console.log(document._id, ':', `${decision.pseudoText}`.trim().slice(-10));
    }
  }
  await cursor.close();
  await client.close();
  return true;
}

main();
