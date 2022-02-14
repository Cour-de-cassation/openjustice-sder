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

  /*
  const normalizedDecision = await JuricaUtils.Normalize(rows[0]);

  if (normalizedDecision.originalText) {
    try {
      const zoning = await Juritools.GetZones(
        normalizedDecision.sourceId,
        'ca', // normalizedDecision.sourceName,
        normalizedDecision.originalText,
        'https://nlp-jurizonage-api.judilibre-prive.local',
      );
      console.log(JSON.stringify(zoning, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
  */

  let row = rows[0];

  try {
    const ShouldBeRejected = JuricaUtils.ShouldBeRejected(row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB);
    if (ShouldBeRejected === false) {
      let partiallyPublic = false;
      try {
        partiallyPublic = JuricaUtils.IsPartiallyPublic(row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB);
      } catch (ignore) {}
      if (true) {
        // partiallyPublic) {
        let trimmedText;
        let zoning;
        try {
          trimmedText = JuricaUtils.CleanHTML(row.JDEC_HTML_SOURCE);
          trimmedText = trimmedText
            .replace(/\*DEB[A-Z]*/gm, '')
            .replace(/\*FIN[A-Z]*/gm, '')
            .trim();
        } catch (e) {
          throw new Error(
            `Cannot process partially-public decision ${row._id} because its text is empty or invalid: ${JSON.stringify(
              e,
              Object.getOwnPropertyNames(e),
            )}.`,
          );
        }
        try {
          zoning = await Juritools.GetZones(row._id, 'ca', trimmedText);
          if (!zoning || zoning.detail) {
            throw new Error(
              `Cannot process partially-public decision ${row._id} because its zoning failed: ${JSON.stringify(
                zoning,
                Object.getOwnPropertyNames(zoning),
              )}.`,
            );
          }
        } catch (e) {
          throw new Error(
            `Cannot process partially-public decision ${row._id} because its zoning failed: ${JSON.stringify(
              e,
              Object.getOwnPropertyNames(e),
            )}.`,
          );
        }
        if (!zoning.zones) {
          throw new Error(
            `Cannot process partially-public decision ${row._id} because it has no zone: ${JSON.stringify(
              zoning,
              Object.getOwnPropertyNames(zoning),
            )}.`,
          );
        }
        if (!zoning.zones.introduction) {
          throw new Error(
            `Cannot process partially-public decision ${row._id} because it has no introduction: ${JSON.stringify(
              zoning.zones,
              Object.getOwnPropertyNames(zoning.zones),
            )}.`,
          );
        }
        if (!zoning.zones.dispositif) {
          throw new Error(
            `Cannot process partially-public decision ${row._id} because it has no dispositif: ${JSON.stringify(
              zoning.zones,
              Object.getOwnPropertyNames(zoning.zones),
            )}.`,
          );
        }
        let parts = [];
        if (Array.isArray(zoning.zones.introduction)) {
          for (let ii = 0; ii < zoning.zones.introduction.length; ii++) {
            parts.push(
              trimmedText.substring(zoning.zones.introduction[ii].start, zoning.zones.introduction[ii].end).trim(),
            );
          }
        } else {
          parts.push(trimmedText.substring(zoning.zones.introduction.start, zoning.zones.introduction.end).trim());
        }
        if (Array.isArray(zoning.zones.dispositif)) {
          for (let ii = 0; ii < zoning.zones.dispositif.length; ii++) {
            parts.push(
              trimmedText.substring(zoning.zones.dispositif[ii].start, zoning.zones.dispositif[ii].end).trim(),
            );
          }
        } else {
          parts.push(trimmedText.substring(zoning.zones.dispositif.start, zoning.zones.dispositif.end).trim());
        }
        row.JDEC_HTML_SOURCE = parts.join('\n[...]\n');
        console.log(row.JDEC_HTML_SOURCE);
      }

      const ShouldBeSentToJudifiltre = JuricaUtils.ShouldBeSentToJudifiltre(
        row.JDEC_CODNAC,
        row.JDEC_CODNACPART,
        row.JDEC_IND_DEC_PUB,
      );
      if (ShouldBeSentToJudifiltre === true) {
        console.log(`Jurica decision ${row._id} should be sent to Judifiltre`);
      } else {
        console.log(`Jurica decision ${row._id} should NOT be sent to Judifiltre`);
      }
    } else {
      console.warn(`Jurica import reject decision ${row._id} (ShouldBeRejected: ${ShouldBeRejected}).`);
    }
  } catch (e) {
    console.error(`Jurica import error processing decision ${row._id}`, e);
  }

  return true;
}

main();
