const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Judifiltre } = require('../judifiltre');
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  let doc;
  let count = 0;
  const cursor = await rawJurica.find({ JDEC_IND_DEC_PUB: { $ne: null } }, { allowDiskUse: true });
  while ((doc = await cursor.next())) {
    console.log({
      id: doc._id,
      pub: doc.JDEC_IND_DEC_PUB,
    });
    count++;
  }

  console.log(count);

  await client.close();

  /*
  const result = await Judifiltre.SendBatch([
    {
      // sourceId: Integer,
      sourceDb: 'jurica',
      decisionDate: new Date(),
      jurisdictionName: 'CA_ROUEN',
      fieldCode: 'AAA',
      publicityClerkRequest: 'unspecified',
    },
  ]);
  */

  /*
  const batch = await Judifiltre.GetBatch();

  console.log(batch);

  const queue = await Judifiltre.GetQueue();

  console.log(queue);
  */

  return true;
}

main();
