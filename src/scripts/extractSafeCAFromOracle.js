const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { parentPort } = require('worker_threads');
const { JuricaOracle } = require('../jurica-oracle');
const { GRCOMOracle } = require('./grcom-oracle');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const iconv = require('iconv-lite');
iconv.skipDecodeWarning = true;
const he = require('he');

let selfKill = setTimeout(cancel, ms('8h'));

function end() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('done');
  kill(0);
}

function cancel() {
  clearTimeout(selfKill);
  if (parentPort) parentPort.postMessage('cancelled');
  kill(1);
}

function kill(code) {
  process.exit(code);
}

async function main(count) {
  const dump = [];
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  const GRCOMSource = new GRCOMOracle();
  await GRCOMSource.connect();
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  prompt.colors = false;
  prompt.start();

  try {
    if (!count) {
      const { in_count } = await prompt.get({
        name: 'in_count',
        message: `Usage : extractSafeCAFromOracle <quantité>\nSaisir la quantité de décisions de cours d'appel à extraire : `,
        validator: /^\d+$/,
      });
      count = parseInt(in_count, 10);
    }

    if (!count || isNaN(count)) {
      throw new Error(`${count} n'est pas une quantité valide.\nUsage : extractSafeCAFromOracle <quantité>`);
    }

    // LIMIT-like query for old versions of Oracle:
    const query = `SELECT * FROM (
        SELECT a.*, ROWNUM rnum FROM (
          SELECT *
          FROM JCA_DECISION
          WHERE JCA_DECISION.JDEC_HTML_SOURCE IS NOT NULL
          AND JCA_DECISION.IND_ANO = 2
          AND JCA_DECISION.AUT_ANO = :label
          ORDER BY JCA_DECISION.JDEC_ID DESC
        ) a WHERE rownum <= ${count}
      ) WHERE rnum >= 0`;

    const result = await juricaSource.connection.execute(query, ['LABEL'], {
      resultSet: true,
    });

    const rs = result.resultSet;

    while ((resultRow = await rs.getRow())) {
      const decision = await parseOracleData(resultRow);
      let normalized = await decisions.findOne({
        sourceId: decision.JDEC_ID,
        sourceName: 'jurica',
        pseudoText: { $ne: null },
      });
      if (normalized === null) {
        throw new Error(
          `Decision ${decision.JDEC_ID} introuvable en version pseudonymisée dans la collection 'decisions'`,
        );
      }
      decision.HTMLA = `<html><head><meta http-equiv="content-type" content="text/html; charset=ISO-8859-1" /></head><body>${he.encode(
        normalized.pseudoText,
      )}</body></html>`;
      decision.JDEC_HTML_SOURCE = decision.HTMLA;
      decision.JDEC_OCC_COMP_LIBRE = null;

      const nac = [];
      if (decision.JDEC_CODNAC) {
        try {
          const queryNac = `SELECT *
          FROM JCA_NAC
          WHERE JCA_NAC.JNAC_F22CODE = :code`;
          const resultNac = await jurinetSource.connection.execute(queryNac, [decision.JDEC_CODNAC]);
          if (resultNac && resultNac.rows && resultNac.rows.length > 0) {
            for (let j = 0; j < resultNac.rows.length; j++) {
              nac.push(await parseOracleData(resultNac.rows[j]));
            }
          }
        } catch (ignore) {}
      }

      const occultations = [];
      if (nac.length > 0) {
        for (let i = 0; i < nac.length; i++) {
          try {
            if (nac[i].JNAC_IND_BLOC) {
              const queryOccultations = `SELECT *
              FROM BLOCS_OCCULT_COMPL
              WHERE BLOCS_OCCULT_COMPL.ID_BLOC = :code`;
              const resultOccultations = await GRCOMSource.connection.execute(queryOccultations, [
                nac[i].JNAC_IND_BLOC,
              ]);
              if (resultOccultations && resultOccultations.rows && resultOccultations.rows.length > 0) {
                for (let j = 0; j < resultOccultations.rows.length; j++) {
                  occultations.push(await parseOracleData(resultOccultations.rows[j]));
                }
              }
            }
          } catch (ignore) {}
        }
      }

      dump.push({
        JCA_DECISION: decision,
        JCA_NAC: nac,
        BLOCS_OCCULT_COMPL: occultations,
      });
    }
    await rs.close();
  } catch (e) {
    console.error(e);
  }

  prompt.stop();
  await juricaSource.close();
  await GRCOMSource.close();
  await client.close();
  console.log(JSON.stringify(dump, null, 2));
  setTimeout(end, ms('1s'));
  return true;
}

async function parseOracleData(data) {
  const parsed = {};
  for (let key in data) {
    switch (key) {
      case 'rnum':
      case 'RNUM':
        // Ignore RNUM key (added by offset/limit queries)
        break;
      default:
        if (data[key] && typeof data[key].getData === 'function') {
          try {
            parsed[key] = await data[key].getData();
          } catch (ignore) {
            parsed[key] = null;
          }
        } else {
          parsed[key] = data[key];
        }
        if (Buffer.isBuffer(parsed[key])) {
          parsed[key] = iconv.decode(parsed[key], 'CP1252');
        }
        break;
    }
  }
  return parsed;
}

main(parseInt(process.argv[2], 10));
