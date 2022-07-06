const fs = require('fs');
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
  console.log('OpenJustice - End "import" job:', new Date().toLocaleString());
  console.log('OpenJustice - Start "sync2" job:', new Date().toLocaleString());
  try {
    await syncJurinet();
  } catch (e) {
    console.error('Jurinet sync2 error', e);
  }
  try {
    await syncJurica();
  } catch (e) {
    console.error('Jurica sync2 error', e);
  }
  console.log('OpenJustice - End "sync2" job:', new Date().toLocaleString());
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

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
    useUnifiedTopology: true,
  });
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
            normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            if (normalized === null) {
              const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              normDec._id = insertResult.insertedId;
              await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
              await jurinetSource.markAsImported(row._id);
              if (row['TYPE_ARRET'] !== 'CC') {
                wincicaCount++;
              }
              newCount++;
            } else {
              console.warn(`Jurinet import issue: { sourceId: ${row._id}, sourceName: 'jurinet' } already inserted...`);
            }
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
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
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

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
    useUnifiedTopology: true,
  });
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
            await rawJurica.insertOne(row, { bypassDocumentValidation: true });
            await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
            await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
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
                  let dateJudifiltre = DateTime.now();
                  existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
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
                normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
                if (normalized === null) {
                  const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                  normDec._id = insertResult.insertedId;
                  await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
                  await juricaSource.markAsImported(row._id);
                  newCount++;
                } else {
                  console.warn(
                    `Jurica import issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`,
                  );
                }
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
  await jIndexConnection.close();
  await juricaSource.close();
  await jurinetSource.close();
  return true;
}

async function syncJurinet() {
  const jurinetSource = new JurinetOracle();
  let now = DateTime.now();
  let jurinetLastDate;

  try {
    jurinetLastDate = DateTime.fromISO(fs.readFileSync(path.join(__dirname, 'data', 'jurinet.lastDate')).toString());
  } catch (ignore) {
    jurinetLastDate = now.minus({ days: 2 });
  }

  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getModifiedSince(jurinetLastDate.toJSDate());

  if (jurinetResult) {
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
    await client.connect();

    const juricaSource = new JuricaOracle();
    await juricaSource.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURINET_COLLECTION);
    const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
      useUnifiedTopology: true,
    });
    await jIndexConnection.connect();
    const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
    const jIndexMain = jIndexClient.collection('mainIndex');
    const jIndexAffaires = jIndexClient.collection('affaires');

    const GRCOMSource = new GRCOMOracle();
    await GRCOMSource.connect();

    console.log(`Syncing Jurinet (${jurinetResult.length} decisions modified since ${jurinetLastDate.toISODate()})...`);

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let wincicaCount = 0;
    let errorCount = 0;
    const changelog = {};

    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;
      let anomalyUpdated = false;
      let reprocessUpdated = false;

      if (rawDocument === null) {
        try {
          row._indexed = null;
          await raw.insertOne(row, { bypassDocumentValidation: true });
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
          newCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet (sync2)');
        } catch (e) {
          console.error(e);
          errorCount++;
        }
        /*
        try {
          if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
            for (let d = 0; d < row._decatt.length; d++) {
              await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
            }
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
        */
      } else {
        const diff = [
          'XML',
          'TYPE_ARRET',
          'JURIDICTION',
          'ID_CHAMBRE',
          'NUM_DECISION',
          'DT_DECISION',
          'ID_SOLUTION',
          'TEXTE_VISE',
          'RAPROCHEMENT',
          'SOURCE',
          'DOCTRINE',
          'IND_ANO',
          'AUT_ANO',
          'DT_ANO',
          'DT_MODIF',
          'DT_MODIF_ANO',
          'DT_ENVOI_DILA',
          '_titrage',
          '_analyse',
          '_partie',
          '_decatt',
          '_portalis',
          '_bloc_occultation',
          'IND_PM',
          'IND_ADRESSE',
          'IND_DT_NAISSANCE',
          'IND_DT_DECE',
          'IND_DT_MARIAGE',
          'IND_IMMATRICULATION',
          'IND_CADASTRE',
          'IND_CHAINE',
          'IND_COORDONNEE_ELECTRONIQUE',
          'IND_PRENOM_PROFESSIONEL',
          'IND_NOM_PROFESSIONEL',
          'IND_BULLETIN',
          'IND_RAPPORT',
          'IND_LETTRE',
          'IND_COMMUNIQUE',
          'ID_FORMATION',
          'OCCULTATION_SUPPLEMENTAIRE',
          '_natureAffaireCivil',
          '_natureAffairePenal',
          '_codeMatiereCivil',
        ];
        const anomaly = ['XML'];
        const reprocess = [
          'IND_PM',
          'IND_ADRESSE',
          'IND_DT_NAISSANCE',
          'IND_DT_DECE',
          'IND_DT_MARIAGE',
          'IND_IMMATRICULATION',
          'IND_CADASTRE',
          'IND_CHAINE',
          'IND_COORDONNEE_ELECTRONIQUE',
          'IND_PRENOM_PROFESSIONEL',
          'IND_NOM_PROFESSIONEL',
          'OCCULTATION_SUPPLEMENTAIRE',
          '_bloc_occultation',
          '_natureAffaireCivil',
          '_natureAffairePenal',
          '_codeMatiereCivil',
        ];
        diff.forEach((key) => {
          if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
            updated = true;
            changelog[key] = {
              old: JSON.stringify(rawDocument[key]),
              new: JSON.stringify(row[key]),
            };
            if (anomaly.indexOf(key) !== -1) {
              anomalyUpdated = true;
            }
            if (reprocess.indexOf(key) !== -1) {
              reprocessUpdated = true;
            }
          }
        });
        /*
        try {
          if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
            for (let d = 0; d < row._decatt.length; d++) {
              const needUpdate = await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
              if (needUpdate) {
                updated = true;
              }
            }
          }
        } catch (e) {
          console.error(e);
          errorCount++;
        }
        */
        if (updated === true) {
          try {
            row._indexed = null;
            if (reprocessUpdated === true) {
              row.IND_ANO = 0;
              row.XMLA = null;
            }
            await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
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
            updateCount++;
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            if (anomalyUpdated === true) {
              await JudilibreIndex.updateJurinetDocument(
                row,
                null,
                `update in rawJurinet (sync2) - Original text could have been changed - changelog: ${JSON.stringify(
                  changelog,
                )}`,
              );
            } else {
              await JudilibreIndex.updateJurinetDocument(
                row,
                null,
                `update in rawJurinet (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            }
          } catch (e) {
            updated = false;
            console.error(e);
            await JudilibreIndex.updateJurinetDocument(
              row,
              null,
              `error while updating in rawJurinet (sync2) - changelog: ${JSON.stringify(changelog)}`,
              e,
            );
            errorCount++;
          }
        }
      }

      let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
      if (normalized === null) {
        try {
          let normDec = await JurinetUtils.Normalize(row);
          normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._version = decisionsVersion;
          normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions (sync2)');
            normalizeCount++;
          } else {
            console.warn(`Jurinet sync issue: { sourceId: ${row._id}, sourceName: 'jurinet' } already inserted...`);
          }
        } catch (e) {
          console.error(e);
          await JudilibreIndex.updateJurinetDocument(row, null, null, e);
          errorCount++;
        }
      } else if (normalized.locked === false) {
        if (updated === true || normalized._version !== decisionsVersion) {
          try {
            let normDec = await JurinetUtils.Normalize(row, normalized);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.dateCreation = new Date().toISOString();
            if (reprocessUpdated === true) {
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'toBeTreated';
              normDec.labelTreatments = [];
              normDec.zoning = null;
            }
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            if (reprocessUpdated === true) {
              await JudilibreIndex.indexDecisionDocument(
                normDec,
                null,
                `update in decisions and reprocessed (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            } else {
              await JudilibreIndex.updateDecisionDocument(
                normDec,
                null,
                `update in decisions (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            }
            normalizeCount++;
          } catch (e) {
            console.error(e);
            await JudilibreIndex.updateDecisionDocument(normalized, null, null, e);
            errorCount++;
          }
        }
      }

      let existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurinet:${row._id}` });
      if (existingDoc === null) {
        rawDocument = await raw.findOne({ _id: row._id });
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
            msg: 'index Jurinet stock (sync2)',
          });
          const existingDocAgain = await JudilibreIndex.findOne('mainIndex', { _id: indexedDoc._id });
          if (existingDocAgain !== null) {
            await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
              bypassDocumentValidation: true,
            });
          } else {
            await JudilibreIndex.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
          }
        }
      }

      let modifTime = DateTime.fromJSDate(row.DT_MODIF);
      jurinetLastDate = DateTime.max(jurinetLastDate, modifTime);
    }

    await juricaSource.close();
    await jIndexConnection.close();
    await GRCOMSource.close();
    await client.close();

    console.log(
      `Done Syncing Jurinet - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurinet - Empty round.`);
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurinet.lastDate'), jurinetLastDate.toISO());

  await jurinetSource.close();

  return true;
}

async function syncJurica() {
  const juricaSource = new JuricaOracle();
  let now = DateTime.now();
  let juricaLastDate;

  try {
    juricaLastDate = DateTime.fromISO(fs.readFileSync(path.join(__dirname, 'data', 'jurica.lastDate')).toString());
  } catch (ignore) {
    juricaLastDate = now.minus({ days: 2 });
  }

  await juricaSource.connect();
  const juricaResult = await juricaSource.getModifiedSince(juricaLastDate.toJSDate()); // @TODO
  await juricaSource.close();

  if (juricaResult) {
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
    await client.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    console.log(`Syncing Jurica (${juricaResult.length} decisions modified since ${juricaLastDate.toISODate()})...`);

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const changelog = {};

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;
      let anomalyUpdated = false;
      let reprocessUpdated = false;
      let duplicate = false;
      let duplicateId = null;

      try {
        duplicateId = await JuricaUtils.GetJurinetDuplicate(row._id);
        if (duplicateId !== null) {
          duplicateId = `jurinet:${duplicateId}`;
          duplicate = true;
        } else {
          duplicate = false;
        }
      } catch (e) {
        duplicate = false;
      }

      if (duplicate === true) {
        duplicateCount++;
      }

      if (rawDocument === null) {
        try {
          row._indexed = null;
          await raw.insertOne(row, { bypassDocumentValidation: true });
          await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica (sync2)');
          newCount++;
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        const diff = [
          'JDEC_HTML_SOURCE',
          'JDEC_DATE',
          'JDEC_DATE_MAJ',
          'JDEC_ID_JURIDICTION',
          'JDEC_CODE_JURIDICTION',
          'JDEC_JURIDICTION',
          'JDEC_CODE_AUTORITE',
          'JDEC_LIB_AUTORITE',
          'JDEC_NUM_RG',
          'JDEC_NUM_REGISTRE',
          'JDEC_NOTICE_FORMAT',
          'JDEC_LIBELLE',
          'JDEC_COMPOSITION',
          'JDEC_SOMMAIRE',
          'IND_ANO',
          'AUT_ANO',
          'JDEC_SELECTION',
          'JDEC_MATIERE_DETERMINEE',
          'JDEC_POURVOI_LOCAL',
          'JDEC_POURVOI_CCASS',
          'JDEC_COLL_DECS_ATTQ',
          'JDEC_FIC_ARCHIVE',
          'JDEC_NOTA_ADMIN',
          'DT_ENVOI_ABONNES',
          'JDEC_LIBNAC',
          'JDEC_CODNACPART',
          'JDEC_LIBNACPART',
          '_portalis',
          'JDEC_CODE',
          'JDEC_CODNAC',
          'JDEC_IND_DEC_PUB',
          'JDEC_OCC_COMP',
          'JDEC_OCC_COMP_LIBRE',
          'JDEC_COLL_PARTIES',
          '_bloc_occultation',
        ];
        const anomaly = ['JDEC_HTML_SOURCE'];
        const reprocess = [
          'JDEC_CODNACPART',
          'JDEC_CODE',
          'JDEC_CODNAC',
          'JDEC_IND_DEC_PUB',
          'JDEC_OCC_COMP',
          'JDEC_OCC_COMP_LIBRE',
          '_bloc_occultation',
        ];
        diff.forEach((key) => {
          if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
            updated = true;
            changelog[key] = {
              old: JSON.stringify(rawDocument[key]),
              new: JSON.stringify(row[key]),
            };
            if (anomaly.indexOf(key) !== -1) {
              anomalyUpdated = true;
            }
            if (reprocess.indexOf(key) !== -1) {
              reprocessUpdated = true;
            }
          }
        });

        if (updated === true) {
          try {
            row._indexed = null;
            if (reprocessUpdated === true) {
              row.IND_ANO = 0;
              row.HTMLA = null;
            }
            await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            if (anomalyUpdated === true) {
              await JudilibreIndex.updateJuricaDocument(
                row,
                duplicateId,
                `update in rawJurica (sync2) - Original text could have been changed - changelog: ${JSON.stringify(
                  changelog,
                )}`,
              );
            } else {
              await JudilibreIndex.updateJuricaDocument(
                row,
                duplicateId,
                `update in rawJurica (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            }
            updateCount++;
          } catch (e) {
            updated = false;
            console.error(e);
            await JudilibreIndex.updateJuricaDocument(
              row,
              duplicateId,
              `error while updating in rawJurica (sync2) - changelog: ${JSON.stringify(changelog)}`,
              e,
            );
            errorCount++;
          }
        }
      }

      let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
      if (normalized === null) {
        try {
          let normDec = await JuricaUtils.Normalize(row);
          normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._version = decisionsVersion;
          if (duplicate === true) {
            normDec.labelStatus = 'exported';
          }
          normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          if (normalized === null) {
            const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            normDec._id = insertResult.insertedId;
            await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions (sync2)');
            normalizeCount++;
          } else {
            console.warn(`Jurica sync issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`);
          }
        } catch (e) {
          console.error(e);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          errorCount++;
        }
      } else if (normalized.locked === false) {
        if (updated === true || normalized._version !== decisionsVersion) {
          try {
            let normDec = await JuricaUtils.Normalize(row, normalized);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.dateCreation = new Date().toISOString();
            if (reprocessUpdated === true) {
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'toBeTreated';
              normDec.labelTreatments = [];
              normDec.zoning = null;
            } else if (duplicate === true) {
              normDec.labelStatus = 'exported';
            }
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            if (reprocessUpdated === true) {
              await JudilibreIndex.indexDecisionDocument(
                normDec,
                duplicateId,
                `update in decisions and reprocessed (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            } else {
              await JudilibreIndex.updateDecisionDocument(
                normDec,
                duplicateId,
                `update in decisions (sync2) - changelog: ${JSON.stringify(changelog)}`,
              );
            }
            normalizeCount++;
          } catch (e) {
            console.error(e);
            await JudilibreIndex.updateDecisionDocument(normalized, null, null, e);
            errorCount++;
          }
        }
      }

      let existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id}` });
      if (existingDoc === null) {
        rawDocument = await raw.findOne({ _id: row._id });
        normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
        if (rawDocument && normalized) {
          const indexedDoc = await JudilibreIndex.buildJuricaDocument(rawDocument, duplicateId);
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
            msg: 'index Jurica stock (sync2)',
          });
          const existingDocAgain = await JudilibreIndex.findOne('mainIndex', { _id: indexedDoc._id });
          if (existingDocAgain !== null) {
            await JudilibreIndex.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, {
              bypassDocumentValidation: true,
            });
          } else {
            await JudilibreIndex.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
          }
        }
      }

      let modifTime = DateTime.fromISO(row.JDEC_DATE_MAJ); // @TODO
      juricaLastDate = DateTime.max(juricaLastDate, modifTime);
    }

    await client.close();

    console.log(
      `Done Syncing Jurica - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurica - Empty round.`);
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurica.lastDate'), juricaLastDate.toISO());

  return true;
}

main();
