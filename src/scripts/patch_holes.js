const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { GRCOMOracle } = require('../grcom-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { Juritools } = require('../juritools');
const { DateTime } = require('luxon');

const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

let selfKill = setTimeout(cancel, ms('1h'));

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

async function main() {
  console.log('OpenJustice - Start "patch_holes" job:', new Date().toLocaleString());
  try {
    await patchJurinet();
  } catch (e) {
    console.error('Jurinet patch_holes error', e);
  }
  try {
    await patchJurica();
  } catch (e) {
    console.error('Jurica patch_holes error', e);
  }
  console.log('OpenJustice - End "patch_holes" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function patchJurinet() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI);
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');

  const GRCOMSource = new GRCOMOracle();
  await GRCOMSource.connect();

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let missingCount = 0;
  let errorCount = 0;

  const query = `SELECT *
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = 1
        ORDER BY ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} DESC`;
  const result = await jurinetSource.connection.execute(query, [], {
    resultSet: true,
  });
  const rs = result.resultSet;
  let resultRow;
  while ((resultRow = await rs.getRow())) {
    let raw = await rawJurinet.findOne({ _id: resultRow[process.env.DB_ID_FIELD] });
    if (raw === null) {
      let row = await jurinetSource.buildRawData(resultRow, true);
      try {
        row._indexed = null;
        await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
        await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet');
        if (row['TYPE_ARRET'] === 'CC') {
          await JurinetUtils.IndexAffaire(
            row,
            jIndexMain,
            jIndexAffaires,
            rawJurica,
            jurinetSource.connection,
            GRCOMSource.connection,
          );
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
          await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
          await jurinetSource.markAsImported(row._id);
          missingCount++;
        }
      } catch (e) {
        console.error(`Jurinet import error processing decision ${row._id}`, e);
        await jurinetSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJurinetDocument(row, null, null, e);
        errorCount++;
      }
    }
  }
  await rs.close();

  console.log(`Done patching Jurinet - Missing: ${missingCount}, Error: ${errorCount}.`);
  await client.close();
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
  return true;
}

async function patchJurica() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION); // XXX TEMP

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI);
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let missingCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let nonPublicCount = 0;

  const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 1
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} DESC`;
  const result = await juricaSource.connection.execute(query, [], {
    resultSet: true,
  });
  const rs = result.resultSet;
  let resultRow;
  while ((resultRow = await rs.getRow())) {
    let raw = await rawJurica.findOne({ _id: resultRow[process.env.DB_ID_FIELD_JURICA] });
    if (raw === null) {
      let row = await juricaSource.buildRawData(resultRow, true);
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
        const ShouldBeRejected = await JuricaUtils.ShouldBeRejected(
          row.JDEC_CODNAC,
          row.JDEC_CODNACPART,
          row.JDEC_IND_DEC_PUB,
        );
        if (ShouldBeRejected === false && duplicate === false) {
          let partiallyPublic = false;
          try {
            partiallyPublic = await JuricaUtils.IsPartiallyPublic(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
          } catch (ignore) {}
          if (partiallyPublic) {
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
                `Cannot process partially-public decision ${
                  row._id
                } because its text is empty or invalid: ${JSON.stringify(
                  e,
                  e ? Object.getOwnPropertyNames(e) : null,
                )}.`,
              );
            }
            try {
              zoning = await Juritools.GetZones(row._id, 'ca', trimmedText);
              if (!zoning || zoning.detail) {
                throw new Error(
                  `Cannot process partially-public decision ${row._id} because its zoning failed: ${JSON.stringify(
                    zoning,
                    zoning ? Object.getOwnPropertyNames(zoning) : null,
                  )}.`,
                );
              }
            } catch (e) {
              throw new Error(
                `Cannot process partially-public decision ${row._id} because its zoning failed: ${JSON.stringify(
                  e,
                  e ? Object.getOwnPropertyNames(e) : null,
                )}.`,
              );
            }
            if (!zoning.zones) {
              throw new Error(
                `Cannot process partially-public decision ${row._id} because it has no zone: ${JSON.stringify(
                  zoning,
                  zoning ? Object.getOwnPropertyNames(zoning) : null,
                )}.`,
              );
            }
            if (!zoning.zones.introduction) {
              throw new Error(
                `Cannot process partially-public decision ${row._id} because it has no introduction: ${JSON.stringify(
                  zoning.zones,
                  zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                )}.`,
              );
            }
            if (!zoning.zones.dispositif) {
              throw new Error(
                `Cannot process partially-public decision ${row._id} because it has no dispositif: ${JSON.stringify(
                  zoning.zones,
                  zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
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
            row.JDEC_HTML_SOURCE = parts.join('\n\n[...]\n\n');
          }
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
          await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
          const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
            row.JDEC_CODNAC,
            row.JDEC_CODNACPART,
            row.JDEC_IND_DEC_PUB,
          );
          if (ShouldBeSentToJudifiltre === true) {
            try {
              const judifiltreResult = await Judifiltre.SendBatch([
                {
                  sourceId: row._id,
                  sourceDb: 'jurica',
                  decisionDate: row.JDEC_DATE,
                  jurisdictionName: row.JDEC_CODE_JURIDICTION,
                  fieldCode: row.JDEC_CODNAC + (row.JDEC_CODNACPART ? '-' + row.JDEC_CODNACPART : ''),
                  publicityClerkRequest:
                    row.JDEC_IND_DEC_PUB === null
                      ? 'unspecified'
                      : parseInt(`${row.JDEC_IND_DEC_PUB}`, 10) === 1
                      ? 'public'
                      : 'notPublic',
                },
              ]);
              await JudilibreIndex.updateJuricaDocument(
                row,
                duplicateId,
                `submitted to Judifiltre: ${JSON.stringify(judifiltreResult)}`,
              );
              const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id}` });
              if (existingDoc !== null) {
                let dateJudifiltre = DateTime.now();
                existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
                await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
                  bypassDocumentValidation: true,
                });
              }
              await juricaSource.markAsImported(row._id);
              missingCount++;
            } catch (e) {
              console.error(`Jurica import to Judifiltre error processing decision ${row._id}`, e);
              await JudilibreIndex.updateJuricaDocument(row, duplicateId, null, e);
              await juricaSource.markAsErroneous(row._id);
              errorCount++;
            }
          } else {
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
              await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
              await juricaSource.markAsImported(row._id);
              missingCount++;
            } else {
              console.warn(
                `Jurica import anomaly: decision ${row._id} seems new but related SDER record ${normalized._id} already exists.`,
              );
              await JudilibreIndex.updateJuricaDocument(row, null, `SDER record ${normalized._id} already exists`);
              await juricaSource.markAsImported(row._id);
              errorCount++;
            }
          }
        } else {
          console.warn(
            `Jurica import reject decision ${row._id} (ShouldBeRejected: ${ShouldBeRejected}, duplicate: ${duplicate}).`,
          );
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(
            row,
            duplicateId,
            duplicate ? `duplicate of ${duplicateId}` : 'non-public',
          );
          if (duplicate) {
            duplicateCount++;
          } else {
            nonPublicCount++;
          }
        }
      } catch (e) {
        console.error(`Jurica import error processing decision ${row._id}`, e);
        await juricaSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJuricaDocument(row, null, null, e);
        errorCount++;
      }
    }
  }
  await rs.close();

  console.log(
    `Done Patching Jurica - Missing: ${missingCount}, Non-public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await jIndexConnection.close();
  await juricaSource.close();
  await jurinetSource.close();
  return true;
}

main();
