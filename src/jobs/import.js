const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true, path: path.join(__dirname, '..', '..', '.env') });
const { CustomLog } = require('./../utils/logger');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { GRCOMOracle } = require('../grcom-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Juritools } = require('../juritools');
const { DateTime } = require('luxon');
const { sendToJurinorm } = require('../jurinorm');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION || 1.0);

async function main() {
  console.log(`OpenJustice - Start collect job:`, new Date().toLocaleString());
  try {
    await importJurinet();
  } catch (e) {
    console.error('Jurinet collect error', e);
  }
  try {
    await importJurica();
  } catch (e) {
    console.error('Jurica collect error', e);
  }
  try {
    await syncJurinet();
  } catch (e) {
    console.error('Jurinet sync error', e);
  }
  try {
    await syncJurica();
  } catch (e) {
    console.error('Jurica sync error', e);
  }
  console.log('OpenJustice - End collect job:', new Date().toLocaleString());
  await new Promise((resolve) => setTimeout(resolve, 1000));
  process.exit(0);
}

async function importJurinet() {
  const CCLimitDate = process.env.NODE_ENV === 'local' ? new Date('0000-00-00') : new Date('2021-09-30');
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexAffaires = jIndexClient.collection('affaires');
  const GRCOMSource = new GRCOMOracle();
  await GRCOMSource.connect();
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  const jurinetResult = await jurinetSource.getNew(process.env.NODE_ENV === 'local' ? 999 : 1);

  // Add available exceptions to the collect stack
  try {
    const exceptions = await JudilibreIndex.find('exceptions', {
      decisionId: /^jurinet:/,
      collected: false,
      published: false,
      reason: { $ne: null },
    });
    if (exceptions !== null) {
      for (let i = 0; i < exceptions.length; i++) {
        try {
          const _row = await jurinetSource.getDecisionByID(exceptions[i].decisionId.split(':')[1]);
          if (_row) {
            jurinetResult.push(_row);
          }
        } catch (ignore) {}
      }
    }
  } catch (ignore) {}

  for (let i = 0; i < jurinetResult.length; i++) {
    let row = jurinetResult[i];
    let exception = null;
    let hasException = false;

    // Only process "true" CC decisions (and "T.CFL" ones)
    if (row['TYPE_ARRET'] === 'CC' || (row['TYPE_ARRET'] === 'AUTRE' && /^t\.cfl$/i.test(row['ID_CHAMBRE']) === true)) {
      try {
        exception = await JudilibreIndex.findOne('exceptions', {
          decisionId: `jurinet:${row._id}`,
          collected: false,
          published: false,
          reason: { $ne: null },
        });
        if (exception !== null) {
          hasException = true;
        }
      } catch (ignore) {}

      let raw = await rawJurinet.findOne({ _id: row._id });
      if (raw === null || hasException === true) {
        try {
          // Reject by date if no exception
          if (hasException === false) {
            let inDate = new Date(Date.parse(row.DT_DECISION.toISOString()));
            inDate.setHours(inDate.getHours() + 2);
            if (inDate.getTime() < CCLimitDate.getTime()) {
              throw new Error(
                `Cannot import decision ${
                  row._id
                } because it is too old (${row.DT_DECISION.toISOString()} < ${CCLimitDate}).`,
              );
            }
            const dateDiff2 = DateTime.fromJSDate(inDate).diffNow('days').toObject();
            if (dateDiff2.days > 1) {
              throw new Error(
                `Cannot import decision ${row._id} because it is too early (${Math.round(dateDiff2.days)} days).`,
              );
            }
          }

          row._indexed = null;
          if (raw === null) {
            await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'ImportJurinetNew',
              msg: `Jurinet insert new CC decision ${row._id})`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
          } else {
            await rawJurinet.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'ImportJurinetAlreadyInserted',
              msg: `Jurinet overwrite already inserted CC decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
          }

          // Normalization
          const normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          const keepPreviousPseudoContent = !hasException || (hasException && exception.resetPseudo === false);
          const normDec = await JurinetUtils.Normalize(row, normalized, keepPreviousPseudoContent);
          normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._version = decisionsVersion;
          newCount++;
          await sendToJurinorm('CC', normDec);
          await jurinetSource.markAsImported(row._id);

          CustomLog.log('info', {
            operationName: 'ImportJurinetNormalize',
            msg: `Jurinet CC decision normalized ${normDec.sourceName}, ${normDec.sourceId}`,
            data: {
              sourceId: normDec.sourceId,
              sourceName: normDec.sourceName,
              registerNumber: normDec.registerNumber,
              labelStatus: normDec.labelStatus,
              publishStatus: normDec.publishStatus,
              jurisdictionName: normDec.jurisdictionName,
              jurisdictionId: normDec.jurisdictionId,
            },
          });

          if (row['TYPE_ARRET'] === 'CC') {
            await JurinetUtils.IndexAffaire(
              row,
              jIndexAffaires,
              rawJurica,
              jurinetSource.connection,
              GRCOMSource.connection,
              decisions,
            );
          }
        } catch (e) {
          await jurinetSource.markAsErroneous(row._id);
          CustomLog.log('error', {
            operationName: 'ImportJurinetError',
            msg: `Error collecting Jurinet CC decision ${row._id}, ${e}`,
            data: {
              sourceId: row._id,
              sourceName: 'jurinet',
            },
          });
          errorCount++;
        }
      } else {
        await jurinetSource.markAsErroneous(row._id);
        CustomLog.log('info', {
          operationName: 'ImportJurinetSkip',
          msg: `Jurinet skip already inserted CC decision ${row._id}`,
          data: {
            sourceId: row._id,
            sourceName: 'jurinet',
          },
        });
        skipCount++;
      }

      // Update processed exception
      if (exception && hasException === true) {
        hasException = false;
        try {
          exception.collected = true;
          await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
            bypassDocumentValidation: true,
          });
        } catch (ignore) {}
      }
    } else {
      await jurinetSource.markAsErroneous(row._id);
      CustomLog.log('info', {
        operationName: 'ImportJurinetSkip',
        msg: `Jurinet skip non CC decision ${row._id}`,
        data: {
          sourceId: row._id,
          sourceName: 'jurinet',
        },
      });
      skipCount++;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await client.close();
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
  CustomLog.log('info', {
    operationName: 'ImportJurinetDone',
    msg: `Done collect Jurinet - New: ${newCount}, Error: ${errorCount}, Skip: ${skipCount}.`,
  });
  return true;
}

async function importJurica() {
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexAffaires = jIndexClient.collection('affaires');
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  let newCount = 0;
  let errorCount = 0;
  let nonPublicCount = 0;
  let skipCount = 0;
  const juricaResult = await juricaSource.getNew(process.env.NODE_ENV === 'local' ? 999 : 1);

  // Add available exceptions to the collect stack
  try {
    const exceptions = await JudilibreIndex.find('exceptions', {
      decisionId: /^jurica:/,
      collected: false,
      published: false,
      reason: { $ne: null },
    });
    if (exceptions !== null) {
      for (let i = 0; i < exceptions.length; i++) {
        try {
          const _row = await juricaSource.getDecisionByID(exceptions[i].decisionId.split(':')[1]);
          if (_row) {
            juricaResult.push(_row);
          }
        } catch (ignore) {}
      }
    }
  } catch (ignore) {}

  for (let i = 0; i < juricaResult.length; i++) {
    let row = juricaResult[i];
    let hasException = false;
    let exception = null;

    try {
      exception = await JudilibreIndex.findOne('exceptions', {
        decisionId: `jurica:${row._id}`,
        collected: false,
        published: false,
        reason: { $ne: null },
      });
      if (exception !== null) {
        hasException = true;
      }
    } catch (ignore) {}

    let raw = await rawJurica.findOne({ _id: row._id });
    if (raw === null || hasException === true) {
      try {
        if (!row.JDEC_DATE) {
          throw new Error(`Cannot import decision ${row._id} because it has no date(${row.JDEC_DATE}).`);
        }

        // Reject by date if no exception
        if (hasException === false) {
          let inDate = new Date();
          let dateDecisionElements = row.JDEC_DATE.split('-');
          inDate.setFullYear(parseInt(dateDecisionElements[0], 10));
          inDate.setMonth(parseInt(dateDecisionElements[1], 10) - 1);
          inDate.setDate(parseInt(dateDecisionElements[2], 10));
          inDate.setHours(0);
          inDate.setMinutes(0);
          inDate.setSeconds(0);
          inDate.setMilliseconds(0);
          inDate = DateTime.fromJSDate(inDate);
          /* It has been disabled in production, don't remember why...
          const CALimitMonth = process.env.NODE_ENV === 'local' ? 0 : 6;
          const dateDiff = inDate.diffNow('months').toObject();
          if (CALimitMonth && dateDiff.months <= -CALimitMonth) {
            throw new Error(
              `Cannot import decision ${row._id} because it is too old (${Math.round(
                Math.abs(dateDiff.months),
              )} months > ${CALimitMonth}).`,
            );
          }
          */
          const dateDiff2 = inDate.diffNow('days').toObject();
          if (dateDiff2.days > 1) {
            throw new Error(
              `Cannot import decision ${row._id} because it is too early (${Math.round(dateDiff2.days)} days).`,
            );
          }
        }

        // Compute rejection based on NAC and zoning
        const ShouldBeRejected = await JuricaUtils.ShouldBeRejected(
          row.JDEC_CODNAC,
          row.JDEC_CODNACPART,
          row.JDEC_IND_DEC_PUB,
        );
        if (ShouldBeRejected === false) {
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
                `Cannot process partially - public decision ${
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
                  `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                    zoning,
                    zoning ? Object.getOwnPropertyNames(zoning) : null,
                  )}.`,
                );
              }
            } catch (e) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                  e,
                  e ? Object.getOwnPropertyNames(e) : null,
                )}.`,
              );
            }
            if (!zoning.zones) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no zone: ${JSON.stringify(
                  zoning,
                  zoning ? Object.getOwnPropertyNames(zoning) : null,
                )}.`,
              );
            }
            if (!zoning.zones.introduction) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no introduction: ${JSON.stringify(
                  zoning.zones,
                  zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                )}.`,
              );
            }
            if (!zoning.zones.dispositif) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no dispositif: ${JSON.stringify(
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

          row._indexed = null;
          if (raw === null) {
            await rawJurica.insertOne(row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'ImportJuricaNew',
              msg: `Jurica insert new CA decision ${row._id})`,
              data: {
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
          } else {
            await rawJurica.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'ImportJuricaAlreadyInserted',
              msg: `Jurica overwrite already inserted CA decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
          }

          const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
            row.JDEC_CODNAC,
            row.JDEC_CODNACPART,
            row.JDEC_IND_DEC_PUB,
          );

          // Normalization
          const normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          const keepPreviousPseudoContent = !hasException || (hasException && exception.resetPseudo === false);
          const normDec = await JuricaUtils.Normalize(row, normalized, keepPreviousPseudoContent);
          normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
          normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
          normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
          normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
          normDec._version = decisionsVersion;
          if (ShouldBeSentToJudifiltre === true) {
            normDec.labelStatus = 'ignored_controleRequis';
            normDec.publishStatus = 'blocked';
            CustomLog.log('info', {
              operationName: 'ImportJuricaBlocked',
              msg: `Jurica CA decision blocked ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurica',
                jdec_codnac: row.JDEC_CODNAC,
                jdec_codnacpart: row.JDEC_CODNACPART,
                jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
              },
            });
          }
          newCount++;
          await sendToJurinorm('CA', normDec);
          await juricaSource.markAsImported(row._id);

          CustomLog.log('info', {
            operationName: 'ImportJuricaNormalize',
            msg: `Jurica CA decision normalized ${normDec.sourceName}, ${normDec.sourceId}`,
            data: {
              sourceId: normDec.sourceId,
              sourceName: normDec.sourceName,
              registerNumber: normDec.registerNumber,
              labelStatus: normDec.labelStatus,
              publishStatus: normDec.publishStatus,
              jurisdictionName: normDec.jurisdictionName,
              jurisdictionId: normDec.jurisdictionId,
            },
          });

          await JuricaUtils.IndexAffaire(row, jIndexAffaires, jurinetSource.connection, decisions);
        } else {
          await juricaSource.markAsErroneous(row._id);
          CustomLog.log('info', {
            operationName: 'ImportJuricaRejected',
            msg: `Jurica import reject CA decision ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}`,
            data: {
              sourceId: row._id,
              sourceName: 'jurica',
              jdec_codnac: row.JDEC_CODNAC,
              jdec_codnacpart: row.JDEC_CODNACPART,
              jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
            },
          });
          nonPublicCount++;
        }
      } catch (e) {
        await juricaSource.markAsErroneous(row._id);
        CustomLog.log('error', {
          operationName: 'ImportJuricaError',
          msg: `Error collecting Jurica CA decision ${row._id}, ${e})`,
          data: {
            sourceId: row._id,
            sourceName: 'jurica',
          },
        });
        errorCount++;
      }
    } else {
      await juricaSource.markAsErroneous(row._id);
      CustomLog.log('error', {
        operationName: 'ImportJuricaSkip',
        msg: `Jurica skip already inserted CA decision ${row._id}`,
        data: {
          sourceId: row._id,
          sourceName: 'jurica',
        },
      });
      skipCount++;
    }

    // Update processed exception
    if (exception && hasException === true) {
      hasException = false;
      try {
        exception.collected = true;
        await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
          bypassDocumentValidation: true,
        });
      } catch (ignore) {}
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await client.close();
  await jIndexConnection.close();
  await juricaSource.close();
  await jurinetSource.close();
  CustomLog.log('info', {
    operationName: 'ImportJuricaDone',
    msg: `Done collect Jurica - New: ${newCount}, Non-public: ${nonPublicCount}, Error: ${errorCount}, Skip: ${skipCount}.`,
  });
  return true;
}

async function syncJurinet() {
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
    'XML',
    'OCCULTATION_SUPPLEMENTAIRE',
    '_bloc_occultation',
    '_natureAffaireCivil',
    '_natureAffairePenal',
    '_codeMatiereCivil',
  ];
  const sensitive = ['XML', '_partie', 'OCCULTATION_SUPPLEMENTAIRE'];
  const doNotCount = ['IND_ANO', 'AUT_ANO', 'DT_ANO', 'DT_MODIF', 'DT_MODIF_ANO', 'DT_ENVOI_DILA'];
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexAffaires = jIndexClient.collection('affaires');
  const GRCOMSource = new GRCOMOracle();
  await GRCOMSource.connect();
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  let updateCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let now = DateTime.now();
  let jurinetLastDate;
  try {
    jurinetLastDate = DateTime.fromISO(fs.readFileSync(path.join(__dirname, 'data', 'jurinet.lastDate')).toString());
  } catch (ignore) {
    jurinetLastDate = now.minus({ days: 2 });
  }
  const jurinetResult = await jurinetSource.getModifiedSince(jurinetLastDate.toJSDate());

  for (let i = 0; i < jurinetResult.length; i++) {
    let row = jurinetResult[i];

    // Only process "true" CC decisions (and "T.CFL" ones)
    if (row['TYPE_ARRET'] === 'CC' || (row['TYPE_ARRET'] === 'AUTRE' && /^t\.cfl$/i.test(row['ID_CHAMBRE']) === true)) {
      let updated = false;
      let diffCount = 0;
      let reprocessUpdated = false;
      let raw = await rawJurinet.findOne({ _id: row._id });
      try {
        if (raw !== null) {
          const changelog = {};
          diff.forEach((key) => {
            if (key === 'XML') {
              let oldXml = null;
              try {
                oldXml = JurinetUtils.CleanXML(raw.XML);
                oldXml = JurinetUtils.XMLToJSON(oldXml, {
                  filter: false,
                  htmlDecode: true,
                  toLowerCase: true,
                });
                oldXml = `${oldXml.texte_arret} `
                  .replace(/\*DEB[A-Z]*/gm, '')
                  .replace(/\*FIN[A-Z]*/gm, '')
                  .trim();
              } catch (e) {
                oldXml = null;
              }
              let newXml = null;
              try {
                newXml = JurinetUtils.CleanXML(row.XML);
                newXml = JurinetUtils.XMLToJSON(newXml, {
                  filter: false,
                  htmlDecode: true,
                  toLowerCase: true,
                });
                newXml = `${newXml.texte_arret} `
                  .replace(/\*DEB[A-Z]*/gm, '')
                  .replace(/\*FIN[A-Z]*/gm, '')
                  .trim();
              } catch (e) {
                newXml = null;
              }
              if (newXml !== oldXml) {
                if (doNotCount.indexOf(key) === -1) {
                  diffCount++;
                }
                updated = true;
                if (sensitive.indexOf(key) !== -1) {
                  changelog[key] = {
                    old: '[SENSITIVE]',
                    new: '[SENSITIVE]',
                  };
                } else {
                  changelog[key] = {
                    old: JSON.stringify(raw[key]),
                    new: JSON.stringify(row[key]),
                  };
                }
                if (reprocess.indexOf(key) !== -1) {
                  reprocessUpdated = true;
                }
              }
            } else if (JSON.stringify(row[key]) !== JSON.stringify(raw[key])) {
              if (doNotCount.indexOf(key) === -1) {
                diffCount++;
              }
              updated = true;
              if (sensitive.indexOf(key) !== -1) {
                changelog[key] = {
                  old: '[SENSITIVE]',
                  new: '[SENSITIVE]',
                };
              } else {
                changelog[key] = {
                  old: JSON.stringify(raw[key]),
                  new: JSON.stringify(row[key]),
                };
              }
              if (reprocess.indexOf(key) !== -1) {
                reprocessUpdated = true;
              }
            }
          });

          if (updated === true && diffCount > 0) {
            row._indexed = null;
            if (reprocessUpdated === true) {
              row.IND_ANO = 0;
              row.XMLA = null;
            }
            await rawJurinet.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'SyncJurinet',
              msg: `Jurinet update CC decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
                changelog: changelog,
              },
            });

            // Normalization
            const normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            const keepPreviousPseudoContent = reprocessUpdated === false;
            const normDec = await JurinetUtils.Normalize(row, normalized, keepPreviousPseudoContent);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.publishStatus = 'toBePublished';
            normDec.dateCreation = new Date().toISOString();
            normDec.zoning = null;
            if (reprocessUpdated === true) {
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'toBeTreated';
              normDec.labelTreatments = [];
            }
            updateCount++;
            await sendToJurinorm('CC', normDec);
            await jurinetSource.markAsImported(row._id);

            CustomLog.log('info', {
              operationName: 'SyncJurinetNormalize',
              msg: `Jurinet update normalized CC decision ${normDec.sourceName}, ${normDec.sourceId}`,
              data: {
                sourceId: normDec.sourceId,
                sourceName: normDec.sourceName,
                jurisdictionId: normDec.jurisdictionId,
                jurisdictionName: normDec.jurisdictionName,
                labelStatus: normDec.labelStatus,
                publishStatus: normDec.publishStatus,
              },
            });

            if (row['TYPE_ARRET'] === 'CC') {
              await JurinetUtils.IndexAffaire(
                row,
                jIndexAffaires,
                rawJurica,
                jurinetSource.connection,
                GRCOMSource.connection,
                decisions,
              );
            }
          } else {
            await jurinetSource.markAsErroneous(row._id);
            CustomLog.log('info', {
              operationName: 'SyncJurinetSkip',
              msg: `Jurinet skip no diff CC decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
            skipCount++;
          }
        } else {
          await jurinetSource.markAsErroneous(row._id);
          CustomLog.log('info', {
            operationName: 'SyncJurinetSkip',
            msg: `Jurinet skip non existing CC decision ${row._id}`,
            data: {
              sourceId: row._id,
              sourceName: 'jurinet',
            },
          });
          skipCount++;
        }
      } catch (e) {
        await jurinetSource.markAsErroneous(row._id);
        CustomLog.log('error', {
          operationName: 'SyncJurinetError',
          msg: `Error syncing Jurinet CC decision ${row._id}, ${e}`,
          data: {
            sourceId: row._id,
            sourceName: 'jurinet',
          },
        });
        errorCount++;
      }
    } else {
      await jurinetSource.markAsErroneous(row._id);
      CustomLog.log('info', {
        operationName: 'SyncJurinetSkip',
        msg: `Jurinet skip non CC decision ${row._id}`,
        data: {
          sourceId: row._id,
          sourceName: 'jurinet',
        },
      });
      skipCount++;
    }

    // Update last date marker
    let modifTime = DateTime.fromJSDate(row.DT_MODIF);
    jurinetLastDate = DateTime.max(jurinetLastDate, modifTime);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // Store last date marker
  try {
    fs.writeFileSync(path.join(__dirname, 'data', 'jurinet.lastDate'), jurinetLastDate.toISO());
  } catch (ignore) {}

  await client.close();
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
  CustomLog.log('info', {
    operationName: 'SyncJurinetDone',
    msg: `Done syncing Jurinet - Update: ${updateCount}, Error: ${errorCount}, Skip: ${skipCount}.`,
  });
  return true;
}

async function syncJurica() {
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
    'JDEC_OCC_COMP',
    'JDEC_OCC_COMP_LIBRE',
    'JDEC_COLL_PARTIES',
    '_bloc_occultation',
  ];
  const reprocess = [
    'JDEC_CODNACPART',
    'JDEC_CODE',
    'JDEC_CODNAC',
    'JDEC_IND_DEC_PUB',
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
    'JDEC_OCC_COMP',
    'JDEC_HTML_SOURCE',
    'JDEC_OCC_COMP_LIBRE',
    '_bloc_occultation',
    'JDEC_SOMMAIRE',  // @XXX to be decided
    'JDEC_SELECTION', // @XXX to be decided
  ];
  const sensitive = ['JDEC_HTML_SOURCE', 'JDEC_COLL_PARTIES', 'JDEC_OCC_COMP_LIBRE', 'JDEC_SOMMAIRE'];
  const doNotCount = ['IND_ANO', 'AUT_ANO', 'DT_ANO', 'DT_MODIF_ANO', 'JDEC_DATE_MAJ', 'DT_ENVOI_ABONNES'];
  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, { directConnection: true });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexAffaires = jIndexClient.collection('affaires');
  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();
  const juricaSource = new JuricaOracle();
  await juricaSource.connect();
  let updateCount = 0;
  let nonPublicCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let now = DateTime.now();
  let juricaLastDate;
  try {
    juricaLastDate = DateTime.fromISO(fs.readFileSync(path.join(__dirname, 'data', 'jurica.lastDate')).toString());
  } catch (ignore) {
    juricaLastDate = now.minus({ days: 2 });
  }
  const juricaResult = await juricaSource.getModifiedSince(juricaLastDate.toJSDate());

  for (let i = 0; i < juricaResult.length; i++) {
    let row = juricaResult[i];

    // Only process "public" CA decisions
    const ShouldBeRejected = await JuricaUtils.ShouldBeRejected(
      row.JDEC_CODNAC,
      row.JDEC_CODNACPART,
      row.JDEC_IND_DEC_PUB,
    );
    if (ShouldBeRejected === false) {
      let updated = false;
      let diffCount = 0;
      let reprocessUpdated = false;
      let raw = await rawJurica.findOne({ _id: row._id });
      try {
        if (raw !== null) {
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
                `Cannot process partially - public decision ${
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
                  `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                    zoning,
                    zoning ? Object.getOwnPropertyNames(zoning) : null,
                  )}.`,
                );
              }
            } catch (e) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                  e,
                  e ? Object.getOwnPropertyNames(e) : null,
                )}.`,
              );
            }
            if (!zoning.zones) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no zone: ${JSON.stringify(
                  zoning,
                  zoning ? Object.getOwnPropertyNames(zoning) : null,
                )}.`,
              );
            }
            if (!zoning.zones.introduction) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no introduction: ${JSON.stringify(
                  zoning.zones,
                  zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                )}.`,
              );
            }
            if (!zoning.zones.dispositif) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because it has no dispositif: ${JSON.stringify(
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

          const changelog = {};
          diff.forEach((key) => {
            if (JSON.stringify(row[key]) !== JSON.stringify(raw[key])) {
              if (doNotCount.indexOf(key) === -1) {
                diffCount++;
              }
              updated = true;
              if (sensitive.indexOf(key) !== -1) {
                changelog[key] = {
                  old: '[SENSITIVE]',
                  new: '[SENSITIVE]',
                };
              } else {
                changelog[key] = {
                  old: JSON.stringify(raw[key]),
                  new: JSON.stringify(row[key]),
                };
              }
              if (reprocess.indexOf(key) !== -1) {
                reprocessUpdated = true;
              }
            }
          });

          if (updated === true && diffCount > 0) {
            const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
            row._indexed = null;
            if (ShouldBeSentToJudifiltre === true) {
              row._indexed = false;
            }
            if (reprocessUpdated === true) {
              row.IND_ANO = 0;
              row.HTMLA = null;
            }
            await rawJurica.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            CustomLog.log('info', {
              operationName: 'SyncJurica',
              msg: `Jurica update CA decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurica',
                changelog: changelog,
              },
            });

            // Normalization
            const normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            const keepPreviousPseudoContent = reprocessUpdated === false;
            const normDec = await JuricaUtils.Normalize(row, normalized, keepPreviousPseudoContent);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normDec.publishStatus = 'toBePublished';
            normDec.dateCreation = new Date().toISOString();
            normDec.zoning = null;
            if (ShouldBeSentToJudifiltre === true) {
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'ignored_controleRequis';
              normDec.publishStatus = 'blocked';
              normDec.labelTreatments = [];
              CustomLog.log('info', {
                operationName: 'SyncJuricaBlocked',
                msg: `Jurica CA decision blocked following an update ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}`,
                data: {
                  sourceId: row._id,
                  sourceName: 'jurica',
                  jdec_codnac: row.JDEC_CODNAC,
                  jdec_codnacpart: row.JDEC_CODNACPART,
                  jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
                },
              });
            } else if (reprocessUpdated === true) {
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'toBeTreated';
              normDec.labelTreatments = [];
            }
            updateCount++;
            await sendToJurinorm('CA', normDec);
            await juricaSource.markAsImported(row._id);

            CustomLog.log('info', {
              operationName: 'SyncJuricaNormalize',
              msg: `Jurica update normalized CA decision ${normDec.sourceName} ${normDec.sourceId}`,
              data: {
                sourceId: normDec.sourceId,
                sourceName: normDec.sourceName,
                labelStatus: normDec.labelStatus,
                publishStatus: normDec.publishStatus,
                jurisdictionId: normDec.jurisdictionId,
                jurisdictionName: normDec.jurisdictionName,
              },
            });

            await JuricaUtils.IndexAffaire(row, jIndexAffaires, jurinetSource.connection, decisions);
          } else {
            await juricaSource.markAsErroneous(row._id);
            CustomLog.log('info', {
              operationName: 'SyncJuricaSkip',
              msg: `Jurica skip no diff CA decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
            skipCount++;
          }
        } else {
          await juricaSource.markAsErroneous(row._id);
          CustomLog.log('info', {
            operationName: 'SyncJuricaSkip',
            msg: `Jurica skip non existing CA decision ${row._id}`,
            data: {
              sourceId: row._id,
              sourceName: 'jurica',
            },
          });
          skipCount++;
        }
      } catch (e) {
        await juricaSource.markAsErroneous(row._id);
        CustomLog.log('error', {
          operationName: 'SyncJuricaError',
          msg: `Error syncing Jurica CA decision ${row._id}, ${e}`,
          data: {
            sourceId: row._id,
            sourceName: 'jurica',
          },
        });
        errorCount++;
      }
    } else {
      await juricaSource.markAsErroneous(row._id);
      CustomLog.log('info', {
        operationName: 'SyncJuricaRejected',
        msg: `Jurica sync reject CA decision ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}`,
        data: {
          sourceId: row._id,
          sourceName: 'jurica',
          jdec_codnac: row.JDEC_CODNAC,
          jdec_codnacpart: row.JDEC_CODNACPART,
          jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
        },
      });
      nonPublicCount++;
    }

    // Update last date marker
    let modifTime = DateTime.fromISO(row.JDEC_DATE_MAJ);
    juricaLastDate = DateTime.max(juricaLastDate, modifTime);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // Store last date marker
  try {
    fs.writeFileSync(path.join(__dirname, 'data', 'jurica.lastDate'), juricaLastDate.toISO());
  } catch (ignore) {}

  await client.close();
  await jIndexConnection.close();
  await juricaSource.close();
  await jurinetSource.close();
  CustomLog.log('info', {
    operationName: 'SyncJuricaDone',
    msg: `Done syncing Jurica - Update: ${updateCount}, Non-public: ${nonPublicCount}, Error: ${errorCount}, Skip: ${skipCount}.`,
  });
  return true;
}

main();
