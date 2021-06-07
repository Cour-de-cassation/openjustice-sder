const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const ms = require('ms');
const { response } = require('express');

let selfKill = setTimeout(cancel, ms('1h'));

function end() {
  if (parentPort) parentPort.postMessage('done');
  setTimeout(kill, ms('1s'), 0);
}

function cancel() {
  if (parentPort) parentPort.postMessage('cancelled');
  setTimeout(kill, ms('1s'), 1);
}

function kill(code) {
  clearTimeout(selfKill);
  process.exit(code);
}

async function main() {
  try {
    await test();
  } catch (e) {
    console.error('Test error', e);
  }
  setTimeout(end, ms('1s'));
}

async function test() {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const query = `SELECT *
        FROM GPCIV.MATIERE`;
  const result = await jurinetSource.connection.execute(query, [], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let resultRow;
  let plan = {};
  let countAll = 0;
  let countActual = 0;
  while ((resultRow = await rs.getRow())) {
    let key = resultRow['ID_MATIERE']
    key = key.trim()
    if (key && plan[key] === undefined) {	
	plan[key] = resultRow['LIB'].trim();
	countActual++;
    }
    countAll++;
  }

  console.log(`${countActual}/${countAll}`);

  fs.writeFileSync('plan.json', JSON.stringify(plan, null, 2));

  await rs.close();
  await jurinetSource.close();
  return true;
}

main();
