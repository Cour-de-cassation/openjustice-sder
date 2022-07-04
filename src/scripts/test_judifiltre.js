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
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let row;
  let deleteCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  const batch1 = await Judifiltre.GetBatch();
  console.log(batch1);

  const batch2 = await Judifiltre.GetNotPublicBatch();
  if (batch2 && batch2.notPublicDecisions && Array.isArray(batch2.notPublicDecisions)) {
    for (let i = 0; i < batch2.notPublicDecisions.length; i++) {
      if (
        batch2.notPublicDecisions[i] &&
        batch2.notPublicDecisions[i].sourceId &&
        batch2.notPublicDecisions[i].sourceDb === 'jurica'
      ) {
        try {
          row = await rawJurica.findOne({ _id: batch2.notPublicDecisions[i].sourceId });
          if (row) {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });

            if (normalized !== null) {
              console.log('delete from decisions', { _id: normalized._id });
            }

            console.log('delete from rawJurica', { _id: row._id });

            console.log('delete from Judifiltre', {
              sourceId: batch2.notPublicDecisions[i].sourceId,
              sourceDb: batch2.notPublicDecisions[i].sourceDb,
            });

            deleteCount++;
          }
        } catch (e) {
          console.error(`Judifiltre cleaning non-public error`, batch2.notPublicDecisions[i]);
          errorCount++;
        }
      } else {
        console.log(`Judifiltre skip non-public decision`, batch2.notPublicDecisions[i]);
        skipCount++;
      }
    }
  } else {
    console.error(`Judifiltre cleaning non-public error`, batch2);
    errorCount++;
  }
  console.log(
    `Done Importing/Cleaning Judifiltre - Cleaned: ${deleteCount}, Skip: ${skipCount}, Error: ${errorCount}.`,
  );
  await client.close();
  return true;
}

main();
