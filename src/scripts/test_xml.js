const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');

async function main() {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const row = await jurinetSource.getDecisionByID(1814051);

  const norm = await JurinetUtils.Normalize(row);

  console.log(norm);

  await jurinetSource.close();
}

main();
