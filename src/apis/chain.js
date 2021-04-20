const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JuricaOracle } = require('../jurica-oracle');

async function main() {
  console.log('Setup DB Clients...');

  const jurinetSource = new JurinetOracle({
    verbose: true,
  });
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle({
    verbose: true,
  });
  await juricaSource.connect();

  const id = 1720000;

  try {
    console.log(`Get chain for decision ${id}...`);
    const chained = await jurinetSource.getChain(id);
    console.log(JSON.stringify(chained, null, '  '));
    const decatt = await juricaSource.getDecisionByRG(chained['DT_CREATION']); // NUM_RG']);
    console.log(JSON.stringify(decatt, null, '  '));
  } catch (e) {
    console.error('Chain failed:', e);
  }

  console.log('Teardown...');
  await jurinetSource.close();
  await juricaSource.close();

  console.log(`Done.`);
  process.exit(0);
}

main();
