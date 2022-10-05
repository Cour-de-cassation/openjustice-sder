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
  // const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let decision;
  const cursor = await decisions
    .find({ pseudoText: { $not: /\w\s?[;.]$/gim }, sourceName: 'jurinet' }, { allowDiskUse: true })
    .sort({ sourceId: -1 });
  while ((decision = await cursor.next())) {
    console.log(decision._id, ':', `${decision.pseudoText}`.slice(-10));
  }
  await cursor.close();
  await client.close();
  return true;
}

main();
