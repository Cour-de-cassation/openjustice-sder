const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Judifiltre } = require('../judifiltre');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  /*

  let doc;
  let count = 0;
  const cursor = await rawJurica.find({ JDEC_IND_DEC_PUB: { $ne: null } }, { allowDiskUse: true });
  while ((doc = await cursor.next())) {
    console.log({
      id: doc._id,
      date: doc.JDEC_DATE,
      pub: doc.JDEC_IND_DEC_PUB,
    });
    count++;
  }

  console.log(count);
  */

  const row = await rawJurica.findOne({ _id: 2497063 });

  try {
    const ShouldBeRejected = JuricaUtils.ShouldBeRejected(row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB);
    const partiallyPublic = JuricaUtils.IsPartiallyPublic(row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB);
    const ShouldBeSentToJudifiltre = JuricaUtils.ShouldBeSentToJudifiltre(
      row.JDEC_CODNAC,
      row.JDEC_CODNACPART,
      row.JDEC_IND_DEC_PUB,
    );
    console.log(ShouldBeRejected, partiallyPublic, ShouldBeSentToJudifiltre);
  } catch (e) {
    console.error(e);
  }

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
