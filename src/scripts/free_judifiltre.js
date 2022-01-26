const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { JudilibreIndex } = require('../judilibre-index');

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  // NOP const queueDocs = await Judifiltre.GetQueue();

  const queueDocs = await JudilibreIndex.find('mainIndex', { 'log.msg': /judifiltre/i });

  console.log(queueDocs.length);

  /*
  for (let i = 0; i < queueDocs.length; i++) {
    if (queueDocs[i]._id === 'jurica:2483944') {
      continue;
    }
    if (queueDocs[i]._id === 'jurica:2483947') {
      continue;
    }
    console.log(`retry ${queueDocs[i]._id} (${i + 1}/${queueDocs.length})...`);

    try {
      let row = await rawJurica.findOne({ _id: parseInt(queueDocs[i]._id.split(':')[1], 10) });

      if (row) {
        const judifiltreResult = await Judifiltre.SendBatch([
          {
            sourceId: row._id,
            sourceDb: 'jurica',
            decisionDate: row.JDEC_DATE,
            jurisdictionName: row.JDEC_CODE_JURIDICTION,
            fieldCode: row.JDEC_CODNAC + (row.JDEC_CODNACPART ? '-' + row.JDEC_CODNACPART : ''),
            publicityClerkRequest:
              row.JDEC_IND_DEC_PUB === null
                ? 'unspecified'
                : parseInt(`${row.JDEC_IND_DEC_PUB}`, 10) === 1
                ? 'public'
                : 'notPublic',
          },
        ]);
        console.log(judifiltreResult);
      }
    } catch (e) {
      console.error(e);
    }
  }
  */

  await client.close();

  return true;
}

main();
