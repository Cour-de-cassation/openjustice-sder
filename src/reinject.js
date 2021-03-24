require('dotenv').config();
const { JurinetOracle } = require('./jurinet-oracle');
const { MongoClient } = require('mongodb');

console.log('Setup...');

/* MAIN LOOP */
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

  let decision;
  const cursor = await decisions.find({ labelStatus: 'done', sourceName: 'jurinet' }, { allowDiskUse: true });
  while (decision = await cursor.next()) {
  	try {
		const done = await jurinetSource.reinject(decision)
		if (done) {
			decision.labelStatus = 'exported'
  			await decisions.replaceOne({ _id: decision[process.env.MONGO_ID] }, decision, {
    				bypassDocumentValidation: true,
  			});
			console.log(`Reinjected decision ${decision.sourceId}.`)
		}
	} catch (e) {
		console.error(e)
	} 
  }

  console.log('Teardown Main Loop...');

  await client.close();
  await jurinetSource.close();

  console.log('Exit Main Loop.');
}

console.log('Run...');

main();
