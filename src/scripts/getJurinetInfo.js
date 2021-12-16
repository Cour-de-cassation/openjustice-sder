const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');

async function main() {
  let id;
  if (process.argv[2]) {
    id = parseInt(process.argv[2], 10);
  }
  if (!id || isNaN(id)) {
    console.log('Usage : getJurinetInfo <JurinetID>');
  } else {
    await getJurinetInfo(id);
  }
}

async function getJurinetInfo(id) {
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const query = `SELECT *
    FROM ${process.env.DB_TABLE}
    WHERE ${process.env.DB_ID_FIELD} = :id`;

  const result = await jurinetSource.connection.execute(query, [id], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let rows = [];
  let resultRow;

  while ((resultRow = await rs.getRow())) {
    rows.push(await jurinetSource.buildRawData(resultRow, false));
  }

  await rs.close();
  await jurinetSource.close();

  console.log(JSON.stringify(rows[0], null, 2));

  return true;
}

main();
