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
      const zoning = await Juritools.GetZones(normalizedDecision.sourceId, 'cc', normalizedDecision.originalText);
      console.log(JSON.stringify(zoning, null, 2));

      console.log(GetDecisionPublicationForIndexing(normalizedDecision, zoning));
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

    const decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
    console.log(JSON.stringify(decatt, null, 2));

    await juricaSource.close();
  } catch (e) {
    console.error(e);
  }

  await jurinetSource.close();
  return true;
}

function GetDecisionPublicationForIndexing(decision, zoning) {
  let publication = [];
  if (decision.publication && Array.isArray(decision.publication) && decision.publication.length > 0) {
    publication = decision.publication;
  } else if (
    zoning &&
    !zoning.detail &&
    zoning.introduction_subzonage &&
    zoning.introduction_subzonage.publication &&
    Array.isArray(zoning.introduction_subzonage.publication) &&
    zoning.introduction_subzonage.publication.length > 0
  ) {
    console.log(
      `GetDecisionPublicationForIndexing: missing publication in new Oracle data, fall back to zoning of decision ${decision.sourceId}: [${zoning.introduction_subzonage.publication}].`,
    );
    let pub = zoning.introduction_subzonage.publication;
    pub.forEach((item) => {
      let chars = item.split('');
      chars.forEach((subItem) => {
        if (publication.indexOf(subItem) === -1) {
          publication.push(subItem);
        }
      });
    });
  }
  if (decision.pubCategory) {
    // Always add pubCategory, just in case...
    publication.push(decision.pubCategory);
  }
  publication = publication
    .map((item) => {
      item = item.toLowerCase();
      switch (item) {
        case 'p':
          item = 'b';
          break;
        case 'i':
          item = 'c';
          break;
      }
      return item;
    })
    .filter((item) => {
      item = item.toLowerCase();
      switch (item) {
        case 'b':
        case 'r':
        case 'l':
        case 'c':
        case 'n':
          return true;
        default:
          return false;
      }
    })
    .filter((item, index, self) => {
      return self.indexOf(item) === index;
    });
  if (publication.length > 0) {
    return publication;
  }
  return ['n'];
}

main();
