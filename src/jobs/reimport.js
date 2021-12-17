const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

let selfKill = setTimeout(cancel, ms('12h'));

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

async function main(n) {
  console.log('OpenJustice - Start "reimport" job:', new Date().toLocaleString());
  /*
  try {
    await reimportJurinet(n);
  } catch (e) {
    console.error('Jurinet reimport error', e);
  }
  */
  /*
  try {
    await reimportJurica(n);
  } catch (e) {
    console.error('Jurica reimport error', e);
  }
  */
  console.log('OpenJustice - End "reimport" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function reimportJurinet(n) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  let normalizedCount = 0;
  let wincicaCount = 0;
  let jurinetResult;

  if (n > 12) {
    console.log(`Reimport Jurinet decision ${n}...`);
    jurinetResult = [await jurinetSource.getDecisionByID(n)];
  } else {
    console.log(`Reimport last ${n} month(s) decisions from Jurinet...`);
    jurinetResult = await jurinetSource.getLastNMonth(n);
  }

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet');
          newCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions (reimport)');
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.dateCreation = new Date().toISOString();
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            await JudilibreIndex.updateDecisionDocument(normDec, null, 'update in decisions (reimport)');
            updateCount++;
          }
          await jurinetSource.markAsImported(row._id);
          if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
            for (let d = 0; d < row._decatt.length; d++) {
              await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
            }
          }
        } catch (e) {
          console.error(e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      } else {
        try {
          row._indexed = null;
          await rawJurinet.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
          updateCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          await JudilibreIndex.updateJurinetDocument(row, null, 'update in rawJurinet (reimport)');
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions (reimport)');
            normalizedCount++;
          } else {
            let normDec = await JurinetUtils.Normalize(row, normalized, true);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.dateCreation = new Date().toISOString();
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            await JudilibreIndex.updateDecisionDocument(normDec, null, 'update in decisions (reimport)');
            normalizedCount++;
          }
          if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
            for (let d = 0; d < row._decatt.length; d++) {
              await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
            }
          }
        } catch (e) {
          console.error(e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      }

      let existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurinet:${row._id}` });
      if (existingDoc === null) {
        rawDocument = await rawJurinet.findOne({ _id: row._id });
        normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
        if (rawDocument && normalized) {
          const indexedDoc = await JudilibreIndex.buildJurinetDocument(rawDocument, null);
          indexedDoc.sderId = normalized._id;
          if (rawDocument._indexed === true) {
            indexedDoc.judilibreId = normalized._id.valueOf();
            if (typeof indexedDoc.judilibreId !== 'string') {
              indexedDoc.judilibreId = `${indexedDoc.judilibreId}`;
            }
          }
          const lastOperation = DateTime.fromJSDate(new Date());
          indexedDoc.lastOperation = lastOperation.toISODate();
          indexedDoc.log.unshift({
            date: new Date(),
            msg: 'index Jurinet stock (reimport)',
          });
          await JudilibreIndex.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
        }
      }
    }
  }

  console.log(
    `Done Reimporting Jurinet - New: ${newCount}, Update: ${updateCount}, Normalized: ${normalizedCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}).`,
  );

  await client.close();
  await juricaSource.close();
  await jurinetSource.close();
  return true;
}

async function reimportJurica(n) {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  /*
  let juricaResult;
  if (n > 12) {
    console.log(`Reimport Jurica decision ${n}...`);
    juricaResult = [await juricaSource.getDecisionByID(n)];
  } else {
    console.log(`Reimport last ${n} month(s) decisions from Jurica...`);
    juricaResult = await juricaSource.getLastNMonth(n);
  }
  */

  let ago = new Date();
  ago.setMonth(ago.getMonth() - n);
  ago.setHours(0, 0, 0, 0);
  let strAgo = ago.getFullYear();
  strAgo += '-' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
  strAgo += '-' + (ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate());

  const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= '${strAgo}'
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} ASC`;

  const result = await juricaSource.connection.execute(query, [], {
    resultSet: true,
  });

  const rs = result.resultSet;
  let resultRow;

  while ((resultRow = await rs.getRow())) {
    let row = await juricaSource.buildRawData(resultRow, true);
    let raw = await rawJurica.findOne({ _id: row._id });
    if (raw === null) {
      try {
        row._indexed = null;
        let duplicate = false;
        let duplicateId = null;
        try {
          duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
          if (duplicateId !== null) {
            duplicateId = `jurinet:${duplicateId}`;
            duplicate = true;
          } else {
            duplicate = false;
          }
        } catch (e) {
          duplicate = false;
        }
        await rawJurica.insertOne(row, { bypassDocumentValidation: true });
        await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
        if (duplicate === false) {
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          if (normalized === null) {
            let normDec = await JuricaUtils.Normalize(row);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions');
            await juricaSource.markAsImported(row._id);
            newCount++;
          } else {
            let normDec = await JuricaUtils.Normalize(row, normalized, true);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec._id = normalized._id;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'reimport in decisions');
            await juricaSource.markAsImported(row._id);
            updateCount++;
          }
        } else {
          await juricaSource.markAsImported(row._id);
          duplicateCount++;
        }
      } catch (e) {
        console.error(`Jurica reimport error processing new decision ${row._id}`, e);
        await juricaSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJuricaDocument(row, null, null, e);
        errorCount++;
      }
    } else {
      try {
        row._indexed = null;
        let duplicate = false;
        let duplicateId = null;
        try {
          duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
          if (duplicateId !== null) {
            duplicateId = `jurinet:${duplicateId}`;
            duplicate = true;
          } else {
            duplicate = false;
          }
        } catch (e) {
          duplicate = false;
        }
        await rawJurica.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
        await JudilibreIndex.updateJuricaDocument(row, duplicateId, 'reimport in rawJurica');
        if (duplicate === false) {
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          if (normalized === null) {
            let normDec = await JuricaUtils.Normalize(row);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions');
            await juricaSource.markAsImported(row._id);
            newCount++;
          } else {
            let normDec = await JuricaUtils.Normalize(row, normalized, true);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec._id = normalized._id;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'reimport in decisions');
            await juricaSource.markAsImported(row._id);
            updateCount++;
          }
        } else {
          await juricaSource.markAsImported(row._id);
          duplicateCount++;
        }
      } catch (e) {
        console.error(`Jurica reimport error processing existing decision ${row._id}`, e);
        await juricaSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJuricaDocument(row, null, null, e);
        errorCount++;
      }
    }
  }
  await rs.close();

  /*
  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {}
  }
  */

  console.log(
    `Done Reimporting Jurica - New: ${newCount}, Update: ${updateCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}).`,
  );

  await client.close();
  await juricaSource.close();
  return true;
}

main(/*862302*/);
