const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { JurinetOracle } = require('../jurinet-oracle');
const { MongoClient } = require('mongodb');

async function main() {
  console.log('Setup DB Clients...');
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const jurinetSource = new JurinetOracle({
    verbose: true,
  });
  await jurinetSource.connect();

  console.log('Retrieve all "done" decisions...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      console.log(`Reinjecting decision ${decision.sourceId}...`);
      await jurinetSource.reinject(decision);

      // The labelStatus of the decision goes from 'done' to 'exported'.
      // We don't do this in the 'reinject' method because we may need
      // to reinject some decisions independently of the Label workflow:
      decision.labelStatus = 'exported';
      await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
        bypassDocumentValidation: true,
      });

      console.log('Reinjection done.');
      successCount++;
    } catch (e) {
      console.error('Reinjection failed:', e);
      errorCount++;
    }
  }

  console.log('Teardown...');
  await client.close();
  await jurinetSource.close();

  console.log(`Done - Success: ${successCount}, Error: ${errorCount}.`);
}

main();
