const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const ms = require('ms');

const iconv = require('iconv-lite');
iconv.skipDecodeWarning = true;

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
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  prompt.colors = false;
  prompt.start();

  try {
    if (!count) {
      const { in_count } = await prompt.get({
        name: 'in_count',
        message: `Usage: extractSafeCCFromOracle <quantité>\nSaisir la quantité de décisions de la Cour de cassation à extraire.`,
        validator: /^\d+$/,
      });
      count = parseInt(in_count, 10);
    }

    if (!count || isNaN(count)) {
      throw new Error(`${count} n'est pas une quantité valide.\nUsage: extractSafeCCFromOracle <quantité>`);
    }

    // LIMIT-like query for old versions of Oracle:
    const query = `SELECT * FROM (
        SELECT a.*, ROWNUM rnum FROM (
          SELECT *
          FROM DOCUMENT
          WHERE DOCUMENT.XMLA IS NOT NULL
          AND DOCUMENT.IND_ANO = 2
          AND DOCUMENT.AUT_ANO = :label
          ORDER BY DOCUMENT.ID_DOCUMENT DESC
        ) a WHERE rownum <= ${count}
      ) WHERE rnum >= 0`;

    const result = await jurinetSource.connection.execute(query, ['LABEL'], {
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
      data.XML = `${data.XMLA}`;
      data.OCCULTATION_SUPPLEMENTAIRE = null;
      console.log(JSON.stringify(data));
    }
    await rs.close();
  } catch (e) {
    console.error(e);
  }

  await jurinetSource.close();
  prompt.stop();
  setTimeout(end, ms('1s'));
  return true;
}

main(parseInt(process.argv[2], 10));
