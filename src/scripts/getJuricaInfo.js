const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { Juritools } = require('../juritools');

async function main() {
  let id;
  if (process.argv[2]) {
    id = parseInt(process.argv[2], 10);
  }
  if (!id || isNaN(id)) {
    console.log('Usage : getJuricaInfo <JuricaID>');
  } else {
    await getJuricaInfo(id);
  }
}

async function getJuricaInfo(id) {
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  const query = `SELECT *
    FROM ${process.env.DB_TABLE_JURICA}
    WHERE ${process.env.DB_ID_FIELD_JURICA} = :id`;

  const result = await juricaSource.connection.execute(query, [id], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let rows = [];
  let resultRow;

  while ((resultRow = await rs.getRow())) {
    rows.push(await juricaSource.buildRawData(resultRow, true));
  }

  await rs.close();
  await juricaSource.close();

  console.log(JSON.stringify(rows[0], null, 2));

  const normalizedDecision = await JuricaUtils.Normalize(rows[0]);

  if (normalizedDecision.originalText) {
    try {
      const zoning = await Juritools.GetZones(normalizedDecision.sourceId, 'ca', normalizedDecision.originalText);
      console.log(JSON.stringify(zoning, null, 2));
    } catch (e) {
      console.error(e);
    }
  }

  return true;
}

main();
