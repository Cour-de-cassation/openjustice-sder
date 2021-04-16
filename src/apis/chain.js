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

  const id = 1730000;

  try {
    console.log(`Get chain for decision ${id}...`);
    const chain = await jurinetSource.getChain(id);
    console.log(chain);
  } catch (e) {
    console.error('Reinjection failed:', e);
  }

  console.log('Teardown...');
  await client.close();
  await jurinetSource.close();

  console.log(`Done.`);
  process.exit(0);
}

main();
