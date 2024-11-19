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

function sequentialQueries(source, queries) {
  return Promise.all(queries.map((query) => source.connection.execute(query, [], { autoCommit: true })));
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

  return sequentialQueries(jurinetSource, queries);
}

function main() {
  return Promise.all([seedca(), seedcc()]).then(console.log).catch(console.error)
}

main();
