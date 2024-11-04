const { resolve } = require('path');
const { readFile } = require('fs/promises');

const { JurinetOracle } = require('../src/jurinet-oracle');
const { PenalOracle } = require('../src/penal-oracle');
const { JuricaOracle } = require('../src/jurica-oracle');
const { GRCOMOracle } = require('../src/grcom-oracle');

if (!process.env.NODE_ENV) require('dotenv').config({ path: resolve(__dirname, '..', '.env') });

function splitQueries(queryString) {
  return queryString.replaceAll(';', '').split(/^\n/gm);
}

async function sequentialQueries(source, queries) {
  for (const query of queries) {
    await source.connection.execute(query);
  }
}

async function migrateJurinet(action = 'create') {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const queryString = await readFile(resolve(__dirname, 'migrations', `jurinet_${action}_schema.sql`), 'utf8');
  const queries = splitQueries(queryString);

  return sequentialQueries(jurinetSource, queries);
}

async function migrateJurica(action = 'create') {
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  const queryString = await readFile(resolve(__dirname, 'migrations', `jurica_${action}_schema.sql`), 'utf8');
  const queries = splitQueries(queryString);

  return sequentialQueries(juricaSource, queries);
}

async function migratePenal(action = 'create') {
  const penalSource = new PenalOracle();
  await penalSource.connect();

  const queryString = await readFile(resolve(__dirname, 'migrations', `penal_${action}_schema.sql`), 'utf8');
  const queries = splitQueries(queryString);

  return sequentialQueries(penalSource, queries);
}

async function migrateGrcom(action = 'create') {
  const grcomSource = new GRCOMOracle();
  await grcomSource.connect();

  const queryString = await readFile(resolve(__dirname, 'migrations', `grcom_${action}_schema.sql`), 'utf8');
  const queries = splitQueries(queryString);

  return sequentialQueries(grcomSource, queries);
}

async function main() {
  try {
    const command = process.argv[2] === 'up' ? 'create' : process.argv[2] === 'down' ? 'drop' : null;

    if (!command) {
      console.log(
        'node migrate.js [ACTION]\n\n' +
          'ACTION:\n' +
          'up: create all schema in database\n' +
          'down: drop all schema in database\n',
      );
      return;
    }

    await migrateJurinet(command);
    await migrateJurica(command);
    await migrateGrcom(command);
    await migratePenal(command);

    console.log('Migrate exit with success');
  } catch (_) {
    console.error(_);
  }
}

main();
