const { resolve } = require('path');
const { readFile } = require('fs/promises');

const { JurinetOracle } = require('../src/jurinet-oracle');
const { JuricaOracle } = require('../src/jurica-oracle');

if (!process.env.NODE_ENV) require('dotenv').config({ path: resolve(__dirname, '..', '.env') });

function splitQueries(queryString) {
  return queryString
    .split(/SELECT 1 FROM DUAL;\n*/g)
    .filter((_) => _ !== '')
    .map((_) => `${_}SELECT 1 FROM DUAL`);
}

async function sequentialQueries(source, queries) {
  for (const query of queries) {
    await source.connection
      .execute(query)
      .then((res) => console.log(res))
      .catch(console.error);
  }
}

async function seedca() {
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  const queryString = await readFile(resolve(__dirname, 'seeds', `ca.decisions.sql`), 'utf8');
  const queries = splitQueries(queryString);

  return sequentialQueries(juricaSource, queries);
}

async function seedcc() {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const queryString = await readFile(resolve(__dirname, 'seeds', `cc.decisions.sql`), 'utf8');
  const queries = splitQueries(queryString);

  console.log(queries);

  return sequentialQueries(jurinetSource, queries);
}

async function main() {
  // seedca()
  //   .catch(console.error);
  seedcc().catch(console.error);
}

main();
