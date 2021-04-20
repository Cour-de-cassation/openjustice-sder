const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { MongoClient } = require('mongodb');

async function main() {
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

  console.log('Retrieve all "done" decisions for Jurinet...');
  let decision,
    successCount = 0,
    errorCount = 0;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true });
  while ((decision = await cursor.next())) {
    try {
      if (decision && decision[process.env.MONGO_ID]) {
        await jurinetSource.reinject(decision);
        // The labelStatus of the decision goes from 'done' to 'exported'.
        // We don't do this in the 'reinject' method because we may need
        // to reinject some decisions independently of the Label workflow:
        decision.labelStatus = 'exported';
        await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
          bypassDocumentValidation: true,
        });
        successCount++;
      }
    } catch (e) {
      console.error(`Jurinet reinjection error processing decision ${decision._id}`, e);
      errorCount++;
    }
  }
  console.log(`Jurinet reinjection done (success: ${successCount}, errors: ${errorCount}).`);
  await client.close();
  await jurinetSource.close();
  process.exit(0);
}

main();
