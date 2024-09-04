const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { parentPort } = require('worker_threads');
const { JuricaOracle } = require('../jurica-oracle');
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
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

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
        message: `Usage: extractSafeCAFromOracle <quantité>\nSaisir la quantité de décisions de cours d'appel à extraire.`,
        validator: /^\d+$/,
      });
      count = parseInt(in_count, 10);
    }

    if (!count || isNaN(count)) {
      throw new Error(`${count} n'est pas une quantité valide.\nUsage: extractSafeCAFromOracle <quantité>`);
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
      const data = {};
      for (let key in resultRow) {
        switch (key) {
          case 'rnum':
          case 'RNUM':
            // Ignore RNUM key (added by offset/limit queries)
            break;
          default:
            if (resultRow[key] && typeof resultRow[key].getData === 'function') {
              try {
                data[key] = await resultRow[key].getData();
              } catch (e) {
                data[key] = null;
              }
            } else {
              data[key] = resultRow[key];
            }
            if (Buffer.isBuffer(data[key])) {
              data[key] = iconv.decode(data[key], 'CP1252');
            }
            break;
        }
      }
      let normalized = await decisions.findOne({
        sourceId: data.JDEC_ID,
        sourceName: 'jurica',
        pseudoStatus: 2,
        pseudoText: { $ne: null },
      });
      if (normalized === null) {
        throw new Error(`Decision ${data.JDEC_ID} introuvable en version pseudonymisée dans la collection 'decisions'`);
      }
      data.HTMLA = `<html><head><meta http-equiv="content-type" content="text/html; charset=ISO-8859-1" /></head><body>${he.encode(
        normalized.pseudoText,
      )}</body></html>`;
      data.JDEC_HTML_SOURCE = `${data.HTMLA}`;
      data.JDEC_OCC_COMP_LIBRE = null;
      console.log(JSON.stringify(data));
    }
    await rs.close();
  } catch (e) {
    console.error(e);
  }

  await juricaSource.close();
  await client.close();
  prompt.stop();
  setTimeout(end, ms('1s'));
  return true;
}

main(parseInt(process.argv[2], 10));
