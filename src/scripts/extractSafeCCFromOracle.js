const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const prompt = require('prompt');
const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { PenalOracle } = require('../penal-oracle');
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
  const dump = [];
  const schema = {};

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const penalSource = new PenalOracle();
  await penalSource.connect();

  prompt.colors = false;
  prompt.start();

  try {
    if (!count) {
      const { in_count } = await prompt.get({
        name: 'in_count',
        message: `Usage : extractSafeCCFromOracle <quantité>\nSaisir la quantité de décisions de la Cour de cassation à extraire : `,
        validator: /^\d+$/,
      });
      count = parseInt(in_count, 10);
    }

    if (!count || isNaN(count)) {
      throw new Error(`${count} n'est pas une quantité valide.\nUsage : extractSafeCCFromOracle <quantité>`);
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
      const decision = await parseOracleData(resultRow, 'DOCUMENT', schema);
      decision.XMLA = `${decision.XMLA}`.replace(/<parties>.*<\/parties>/gims, '<PARTIES></PARTIES>');
      decision.XML = decision.XMLA;
      decision.OCCULTATION_SUPPLEMENTAIRE = null;

      const titrage = [];
      try {
        const queryTitrage = `SELECT *
          FROM TITREREFERENCE
          WHERE TITREREFERENCE.ID_DOCUMENT = :id`;
        const resultTitrage = await jurinetSource.connection.execute(queryTitrage, [decision.ID_DOCUMENT]);
        if (resultTitrage && resultTitrage.rows && resultTitrage.rows.length > 0) {
          for (let j = 0; j < resultTitrage.rows.length; j++) {
            titrage.push(await parseOracleData(resultTitrage.rows[j], 'TITREREFERENCE', schema));
          }
        }
      } catch (ignore) {}

      const analyse = [];
      try {
        const queryAnalyse = `SELECT *
          FROM ANALYSE
          WHERE ANALYSE.ID_DOCUMENT = :id`;
        const resultAnalyse = await jurinetSource.connection.execute(queryAnalyse, [decision.ID_DOCUMENT]);
        if (resultAnalyse && resultAnalyse.rows && resultAnalyse.rows.length > 0) {
          for (let j = 0; j < resultAnalyse.rows.length; j++) {
            analyse.push(await parseOracleData(resultAnalyse.rows[j], 'ANALYSE', schema));
          }
        }
      } catch (ignore) {}

      const partie = [];
      try {
        const queryPartie = `SELECT *
          FROM VIEW_PARTIE
          WHERE VIEW_PARTIE.ID_DOCUMENT = :id`;
        const resultPartie = await jurinetSource.connection.execute(queryPartie, [decision.ID_DOCUMENT]);
        if (resultPartie && resultPartie.rows && resultPartie.rows.length > 0) {
          for (let j = 0; j < resultPartie.rows.length; j++) {
            const _partie = await parseOracleData(resultPartie.rows[j], 'VIEW_PARTIE', schema);
            if (_partie.TYPE_PERSONNE !== 'PARTIE') {
              partie.push(_partie);
            }
          }
        }
      } catch (ignore) {}

      const numPourvoi = [];
      try {
        const queryNumPourvoi = `SELECT *
          FROM NUMPOURVOI
          WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
        const resultNumPourvoi = await jurinetSource.connection.execute(queryNumPourvoi, [decision.ID_DOCUMENT]);
        if (resultNumPourvoi && resultNumPourvoi.rows && resultNumPourvoi.rows.length > 0) {
          for (let j = 0; j < resultNumPourvoi.rows.length; j++) {
            numPourvoi.push(await parseOracleData(resultNumPourvoi.rows[j], 'NUMPOURVOI', schema));
          }
        }
      } catch (ignore) {}

      const affaireCiv = [];
      if (numPourvoi.length > 0) {
        for (let i = 0; i < numPourvoi.length; i++) {
          try {
            const queryAffaireCiv = `SELECT *
              FROM GPCIV.AFF
              WHERE GPCIV.AFF.CODE = :code`;
            const resultAffaireCiv = await jurinetSource.connection.execute(queryAffaireCiv, [
              numPourvoi[i].NUMPOURVOICODE,
            ]);
            if (resultAffaireCiv && resultAffaireCiv.rows && resultAffaireCiv.rows.length > 0) {
              for (let j = 0; j < resultAffaireCiv.rows.length; j++) {
                affaireCiv.push(await parseOracleData(resultAffaireCiv.rows[j], 'GPCIV.AFF', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      const affairePen = [];
      if (numPourvoi.length > 0) {
        for (let i = 0; i < numPourvoi.length; i++) {
          try {
            const queryAffairePen = `SELECT *
              FROM GPPEN.AFF
              WHERE GPPEN.AFF.CODE = :code`;
            const resultAffairePen = await jurinetSource.connection.execute(queryAffairePen, [
              numPourvoi[i].NUMPOURVOICODE,
            ]);
            if (resultAffairePen && resultAffairePen.rows && resultAffairePen.rows.length > 0) {
              for (let j = 0; j < resultAffairePen.rows.length; j++) {
                affairePen.push(await parseOracleData(resultAffairePen.rows[j], 'GPPEN.AFF', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      const matiere = [];
      if (affaireCiv.length > 0) {
        for (let i = 0; i < affaireCiv.length; i++) {
          try {
            const queryMatiere = `SELECT *
              FROM GPCIV.MATIERE
              WHERE GPCIV.MATIERE.ID_MATIERE = :code`;
            const resultMatiere = await jurinetSource.connection.execute(queryMatiere, [affaireCiv[i].ID_MATIERE]);
            if (resultMatiere && resultMatiere.rows && resultMatiere.rows.length > 0) {
              for (let j = 0; j < resultMatiere.rows.length; j++) {
                matiere.push(await parseOracleData(resultMatiere.rows[j], 'GPCIV.MATIERE', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      const matiereBis = [];
      if (affaireCiv.length > 0) {
        for (let i = 0; i < affaireCiv.length; i++) {
          try {
            const queryMatiere = `SELECT *
              FROM GRCIV.MATIERE
              WHERE GRCIV.MATIERE.ID_MATIERE = :code`;
            const resultMatiere = await jurinetSource.connection.execute(queryMatiere, [affaireCiv[i].ID_MATIERE]);
            if (resultMatiere && resultMatiere.rows && resultMatiere.rows.length > 0) {
              for (let j = 0; j < resultMatiere.rows.length; j++) {
                matiereBis.push(await parseOracleData(resultMatiere.rows[j], 'GRCIV.MATIERE', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      const natAffairePen = [];
      if (affairePen.length > 0) {
        for (let i = 0; i < affairePen.length; i++) {
          try {
            const queryNatAff = `SELECT *
              FROM GRPEN.NATAFF
              WHERE GRPEN.NATAFF.ID_NATAFF = :code`;
            const resultNatAff = await penalSource.connection.execute(queryNatAff, [affairePen[i].ID_NATAFF]);
            if (resultNatAff && resultNatAff.rows && resultNatAff.rows.length > 0) {
              for (let j = 0; j < resultNatAff.rows.length; j++) {
                natAffairePen.push(await parseOracleData(resultNatAff.rows[j], 'GRPEN.NATAFF', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      const nao = [];
      if (affaireCiv.length > 0) {
        for (let i = 0; i < affaireCiv.length; i++) {
          try {
            const queryNao = `SELECT *
              FROM GPCIV.NAO
              WHERE GPCIV.NAO.ID_NAO = :code`;
            const resultNao = await jurinetSource.connection.execute(queryNao, [affaireCiv[i].ID_NAO]);
            if (resultNao && resultNao.rows && resultNao.rows.length > 0) {
              for (let j = 0; j < resultNao.rows.length; j++) {
                nao.push(await parseOracleData(resultNao.rows[j], 'GPCIV.NAO', schema));
              }
            }
          } catch (ignore) {}
        }
      }

      dump.push({
        DOCUMENT: decision,
        TITREREFERENCE: titrage,
        ANALYSE: analyse,
        VIEW_PARTIE: partie,
        NUMPOURVOI: numPourvoi,
        'GPCIV.AFF': affaireCiv,
        'GPPEN.AFF': affairePen,
        'GPCIV.MATIERE': matiere,
        'GRCIV.MATIERE': matiereBis, // Difference ???
        'GRPEN.NATAFF': natAffairePen,
        'GPCIV.NAO': nao,
      });
    }
    await rs.close();
  } catch (e) {
    console.error(e);
  }

  prompt.stop();
  await jurinetSource.close();
  await penalSource.close();
  console.log(
    JSON.stringify(
      {
        decisions: dump,
        schema: schema,
      },
      null,
      2,
    ),
  );
  setTimeout(end, ms('1s'));
  return true;
}

async function parseOracleData(data, tableName, schema) {
  const parsed = {};
  for (let key in data) {
    switch (key) {
      case 'rnum':
      case 'RNUM':
        // Ignore RNUM key (added by offset/limit queries)
        break;
      default:
        if (data[key] && typeof data[key].getData === 'function') {
          if (schema[tableName] === undefined) {
            schema[tableName] = {};
          }
          if (schema[tableName][key] === undefined) {
            schema[tableName][key] = {};
          }
          schema[tableName][key].CLOB = true;
          try {
            parsed[key] = await data[key].getData();
          } catch (ignore) {
            parsed[key] = null;
          }
        } else {
          parsed[key] = data[key];
        }
        if (Buffer.isBuffer(parsed[key])) {
          if (schema[tableName] === undefined) {
            schema[tableName] = {};
          }
          if (schema[tableName][key] === undefined) {
            schema[tableName][key] = {};
          }
          schema[tableName][key].CP1252 = true;
          parsed[key] = iconv.decode(parsed[key], 'CP1252');
        } else {
          const test = iconv.decode(Buffer.from(`${parsed[key]}`, 'CP1252'), 'CP1252');
          if (`${parsed[key]}` !== test) {
            if (schema[tableName] === undefined) {
              schema[tableName] = {};
            }
            if (schema[tableName][key] === undefined) {
              schema[tableName][key] = {};
            }
            schema[tableName][key].PROBLEM = test;
          }
        }
        break;
    }
  }
  return parsed;
}

main(parseInt(process.argv[2], 10));
