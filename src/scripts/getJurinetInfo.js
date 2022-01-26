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
    const decattInfo = await jurinetSource.getDecatt(id);
    console.log(JSON.stringify(decattInfo, null, 2));

    const { JuricaOracle } = require('../jurica-oracle');
    const juricaSource = new JuricaOracle();
    await juricaSource.connect();

    /*
    const decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
    console.log(JSON.stringify(decatt, null, 2));
    */

    let decattDate1 = new Date(Date.parse(decattInfo['DT_DECATT']));
    decattDate1.setDate(decattDate1.getDate() - 1);
    let strDecatt1 = decattDate1.getFullYear();
    strDecatt1 +=
      '-' + (decattDate1.getMonth() + 1 < 10 ? '0' + (decattDate1.getMonth() + 1) : decattDate1.getMonth() + 1);
    strDecatt1 += '-' + (decattDate1.getDate() < 10 ? '0' + decattDate1.getDate() : decattDate1.getDate());

    let decattDate2 = new Date(Date.parse(decattInfo['DT_DECATT']));
    decattDate2.setDate(decattDate2.getDate() + 1);
    let strDecatt2 = decattDate2.getFullYear();
    strDecatt2 +=
      '-' + (decattDate2.getMonth() + 1 < 10 ? '0' + (decattDate2.getMonth() + 1) : decattDate2.getMonth() + 1);
    strDecatt2 += '-' + (decattDate2.getDate() < 10 ? '0' + decattDate2.getDate() : decattDate2.getDate());

    const decisionQuery = `SELECT *
      FROM ${process.env.DB_TABLE_JURICA}
      WHERE ${process.env.DB_TABLE_JURICA}.JDEC_DATE >= '${strDecatt1}'
      AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE <= '${strDecatt2}'`;

    console.log(decisionQuery);

    const decisionResult = await juricaSource.connection.execute(decisionQuery, []);

    if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
      for (let i = 0; i < decisionResult.rows.length; i++) {
        if (
          decisionResult.rows[i].JDEC_NUM_RG &&
          decisionResult.rows[i].JDEC_NUM_RG.indexOf(decattInfo['NUM_RG']) !== -1
        ) {
          console.log(decisionResult.rows[i].JDEC_ID, `*${decisionResult.rows[i].JDEC_NUM_RG}*`);
        }
      }
    }
    await juricaSource.close();
  } catch (e) {
    console.error(e);
  }

  await jurinetSource.close();
  return true;
}

main();
