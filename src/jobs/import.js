const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');
const { Juritools } = require('../juritools');

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
  console.log('OpenJustice - Start "import" job:', new Date().toLocaleString());
  try {
    await importJurinet();
  } catch (e) {
    console.error('Jurinet import error', e);
  }
  try {
    await importJurica();
  } catch (e) {
    console.error('Jurica import error', e);
  }
  try {
    // await importJudifiltre();
  } catch (e) {
    console.error('Jurica import error', e);
  }
  console.log('OpenJustice - End "import" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function importJurinet() {
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
  let errorCount = 0;
  let wincicaCount = 0;

  const jurinetResult = await jurinetSource.getNew();

  if (jurinetResult) {
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet');
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
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
            /*
            if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
              for (let d = 0; d < row._decatt.length; d++) {
                await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
              }
            }
            */
          }
        } catch (e) {
          console.error(`Jurinet import error processing decision ${row._id}`, e);
          await jurinetSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      }
    }
  }

  console.log(`Done Importing Jurinet - New: ${newCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`);
  await client.close();
  await jurinetSource.close();
  await juricaSource.close();
  return true;
}

async function importJurica() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION); // XXX TEMP

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  let newCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let nonPublicCount = 0;

  const juricaResult = await juricaSource.getNew();

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
          const ShouldBeRejected = JuricaUtils.ShouldBeRejected(
            row.JDEC_CODNAC,
            row.JDEC_CODNACPART,
            row.JDEC_IND_DEC_PUB,
          );
          if (ShouldBeRejected === false && duplicate === false) {
            let partiallyPublic = false;
            try {
              partiallyPublic = JuricaUtils.IsPartiallyPublic(
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
                  } because its text is empty or invalid: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}.`,
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
            await rawJurica.insertOne(row, { bypassDocumentValidation: true });
            await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
            const ShouldBeSentToJudifiltre = JuricaUtils.ShouldBeSentToJudifiltre(
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
                  existingDoc.dateJudifiltre = new Date().toISODate();
                  await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
                    bypassDocumentValidation: true,
                  });
                }
                await juricaSource.markAsImported(row._id);
                newCount++;
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
                newCount++;
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
  }

  console.log(
    `Done Importing Jurica - New: ${newCount}, Non-public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await juricaSource.close();
  return true;
}

async function importJudifiltre() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let row;
  let newCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  try {
    const batch = await Judifiltre.GetBatch();
    if (batch && batch.releasableDecisions && Array.isArray(batch.releasableDecisions)) {
      for (let i = 0; i < batch.releasableDecisions.length; i++) {
        if (
          batch.releasableDecisions[i] &&
          batch.releasableDecisions[i].sourceId &&
          batch.releasableDecisions[i].sourceDb === 'jurica'
        ) {
          try {
            row = await rawJurica.findOne({ _id: batch.releasableDecisions[i].sourceId });
            if (row) {
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
                newCount++;
                try {
                  const judifiltreResult = await Judifiltre.DeleteBatch([
                    {
                      sourceId: batch.releasableDecisions[i].sourceId,
                      sourceName: batch.releasableDecisions[i].sourceName,
                    },
                  ]);
                  await JudilibreIndex.updateJuricaDocument(
                    row,
                    null,
                    `deleted from Judifiltre: ${JSON.stringify(judifiltreResult)}`,
                  );
                } catch (e) {
                  console.error(`Judifiltre delete error`, e);
                  errorCount++;
                }
              }
            } else {
              console.error(
                `Judifiltre import error: decision ${batch.releasableDecisions[i].sourceId} not found in rawJurica`,
              );
              errorCount++;
            }
          } catch (e) {
            console.error(`Judifiltre import error`, batch.releasableDecisions[i]);
            errorCount++;
          }
        } else {
          console.log(`Judifiltre skip decision`, batch.releasableDecisions[i]);
          skipCount++;
        }
      }
    } else {
      console.error(`Judifiltre import error`, batch);
      errorCount++;
    }
  } catch (e) {
    console.error(`Judifiltre import error`, e);
    errorCount++;
  }

  console.log(`Done Importing Judifiltre - New: ${newCount}, Skip: ${skipCount}, Error: ${errorCount}.`);
  await client.close();
  return true;
}

main();
