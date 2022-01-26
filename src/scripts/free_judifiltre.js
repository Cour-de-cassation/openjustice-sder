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

  // NOP: const queueDocs = await Judifiltre.GetQueue();

  const queueDocs = await JudilibreIndex.find('mainIndex', { 'log.msg': /judifiltre/i });

  for (let i = 0; i < queueDocs.length; i++) {
    console.log(`free ${queueDocs[i]._id} (${i + 1}/${queueDocs.length})...`);

    try {
      let row = await rawJurica.findOne({ _id: parseInt(queueDocs[i]._id.split(':')[1], 10) });

      if (row) {
        console.log('ok');
      } else {
        console.log('NOK');
      }
    } catch (e) {
      console.error(e);
    }
  }

  await client.close();

  return true;
}

main();
