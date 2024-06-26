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
  console.log('OpenJustice - Start retry import script:', new Date().toLocaleString());
  try {
    await retryImportJurinet();
  } catch (e) {
    console.error('Jurinet retry import error', e);
  }
  try {
    await retryImportJurica();
  } catch (e) {
    console.error('Jurica retry import error', e);
  }
  console.log('OpenJustice - End retry import job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function retryImportJurinet() {
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

  let newCount = 0;
  let errorCount = 0;
  let wincicaCount = 0;
  let skipRawCount = 0;
  let skipCount = 0;

  const jurinetResult = await jurinetSource.getFaulty();

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJurinetDocument(row, null, 'retry import in rawJurinet #1');
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
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'retry import in decisions #1');
            await jurinetSource.markAsImported(row._id);
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet retry import error processing decision ${row._id} #1`, e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      } else {
        skipRawCount++;
        try {
          row._indexed = null;
          await rawJurinet.replaceOne({ _id: row._id }, row, {
            bypassDocumentValidation: true,
          });
          await JudilibreIndex.indexJurinetDocument(row, null, 'retry import in rawJurinet #2');
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
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'retry import in decisions #3');
            await jurinetSource.markAsImported(row._id);
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
          } else {
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet retry import error processing decision ${row._id} #2`, e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Retry Importing Jurinet - New: ${newCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}, Skip Raw: ${skipRawCount}, Skip SDER: ${skipCount}.`,
  );
  await client.close();
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
  return true;
}

async function retryImportJurica() {
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

  let newCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let nonPublicCount = 0;
  let skipRawCount = 0;
  let skipCount = 0;

  const juricaResult = await juricaSource.getFaulty();

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
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
                    trimmedText
                      .substring(zoning.zones.introduction[ii].start, zoning.zones.introduction[ii].end)
                      .trim(),
                  );
                }
              } else {
                parts.push(
                  trimmedText.substring(zoning.zones.introduction.start, zoning.zones.introduction.end).trim(),
                );
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
            /* XXX
            await rawJurica.insertOne(row, { bypassDocumentValidation: true });
            await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'retry import in rawJurica #1');
            await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
            */
            const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
            console.log(`rawJurica.insertOne(${row._id})`);
            console.log(`JudilibreIndex.indexJuricaDocument(${row._id})`);
            console.log(`JuricaUtils.IndexAffaire(${row._id})`);
            console.log(`ShouldBeSentToJudifiltre: ${ShouldBeSentToJudifiltre})`);
            if (ShouldBeSentToJudifiltre === true) {
              try {
                /* XXX
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
                */
                newCount++;
              } catch (e) {
                console.error(`Jurica import to Judifiltre error processing decision ${row._id}`, e);
                /* XXX
                await JudilibreIndex.updateJuricaDocument(row, duplicateId, null, e);
                await juricaSource.markAsErroneous(row._id);
                */
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
                /* XXX
                const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                normDec._id = insertResult.insertedId;
                await JudilibreIndex.indexDecisionDocument(normDec, null, 'retry import in decisions #1');
                await juricaSource.markAsImported(row._id);
                */
                newCount++;
              } else {
                skipCount++;
                console.warn(
                  `Jurica import anomaly: decision ${row._id} seems new but related SDER record ${normalized._id} already exists.`,
                );
                /* XXX
                await JudilibreIndex.updateJuricaDocument(row, null, `SDER record ${normalized._id} already exists`);
                await juricaSource.markAsImported(row._id);
                */
                errorCount++;
              }
            }
          } else {
            console.warn(
              `Jurica import reject decision ${row._id} (ShouldBeRejected: ${ShouldBeRejected}, duplicate: ${duplicate}).`,
            );
            /* XXX
            await juricaSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJuricaDocument(
              row,
              duplicateId,
              duplicate ? `duplicate of ${duplicateId}` : 'non-public',
            );
            */
            if (duplicate) {
              duplicateCount++;
            } else {
              nonPublicCount++;
            }
          }
        } catch (e) {
          console.error(`Jurica retry import error processing decision ${row._id}#1`, e);
          /* XXX
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          */
          errorCount++;
        }
      } else {
        skipRawCount++;
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
                    trimmedText
                      .substring(zoning.zones.introduction[ii].start, zoning.zones.introduction[ii].end)
                      .trim(),
                  );
                }
              } else {
                parts.push(
                  trimmedText.substring(zoning.zones.introduction.start, zoning.zones.introduction.end).trim(),
                );
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
            /* XXX
            await rawJurica.replaceOne({ _id: row._id }, row, {
              bypassDocumentValidation: true,
            });
            await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'retry import in rawJurica #2');
            await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
            */
            const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
            console.log(`rawJurica.replaceOne(${row._id})`);
            console.log(`JudilibreIndex.indexJuricaDocument(${row._id})`);
            console.log(`JuricaUtils.IndexAffaire(${row._id})`);
            console.log(`ShouldBeSentToJudifiltre: ${ShouldBeSentToJudifiltre})`);
            if (ShouldBeSentToJudifiltre === true) {
              try {
                /* XXX
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
                */
                newCount++;
              } catch (e) {
                console.error(`Jurica import to Judifiltre error processing decision ${row._id}`, e);
                /* XXX
                await JudilibreIndex.updateJuricaDocument(row, duplicateId, null, e);
                await juricaSource.markAsErroneous(row._id);
                */
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
                /* XXX
                const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                normDec._id = insertResult.insertedId;
                await JudilibreIndex.indexDecisionDocument(normDec, null, 'retry import in decisions #1');
                await juricaSource.markAsImported(row._id);
                */
                newCount++;
              } else {
                skipCount++;
                console.warn(
                  `Jurica import anomaly: decision ${row._id} seems new but related SDER record ${normalized._id} already exists.`,
                );
                /* XXX
                await JudilibreIndex.updateJuricaDocument(row, null, `SDER record ${normalized._id} already exists`);
                await juricaSource.markAsImported(row._id);
                */
                errorCount++;
              }
            }
          } else {
            console.warn(
              `Jurica import reject decision ${row._id} (ShouldBeRejected: ${ShouldBeRejected}, duplicate: ${duplicate}).`,
            );
            /* XXX
            await juricaSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJuricaDocument(
              row,
              duplicateId,
              duplicate ? `duplicate of ${duplicateId}` : 'non-public',
            );
            */
            if (duplicate) {
              duplicateCount++;
            } else {
              nonPublicCount++;
            }
          }
        } catch (e) {
          console.error(`Jurica retry import error processing decision ${row._id}#2`, e);
          /* XXX
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          */
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Importing Jurica - New: ${newCount}, Non-public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}, Skip Raw: ${skipRawCount}, Skip SDER: ${skipCount}.`,
  );
  await client.close();
  await jIndexConnection.close();
  await juricaSource.close();
  await jurinetSource.close();
  return true;
}

main();
