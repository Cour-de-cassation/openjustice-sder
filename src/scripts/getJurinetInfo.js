const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { Juritools } = require('../juritools');

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
    rows.push(await jurinetSource.buildRawData(resultRow, true));
  }

  await rs.close();
  await jurinetSource.close();

  console.log(JSON.stringify(rows[0], null, 2));

  const normalizedDecision = await JurinetUtils.Normalize(rows[0]);

  if (normalizedDecision.originalText) {
    try {
      const zoning = await Juritools.GetZones(
        normalizedDecision.sourceId,
        'cc', // normalizedDecision.sourceName,
        normalizedDecision.originalText,
        'https://nlp-jurizonage-api.judilibre-prive.local',
      );
      console.log(JSON.stringify(zoning, null, 2));
    } catch (e) {
      console.error(e);
    }
  }

  try {
    const decattInfo = jurinetSource.getDecatt(id);
    console.log(JSON.stringify(decattInfo, null, 2));
  } catch (e) {
    console.error(e);
  }

  return true;
}

main();
