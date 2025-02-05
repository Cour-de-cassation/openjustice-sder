const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { CustomLog } = require('./../utils/logger');
const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { GRCOMOracle } = require('../grcom-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Juritools } = require('../juritools');
const { DateTime } = require('luxon');

const ms = require('ms');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

let selfKill = setTimeout(cancel, ms('1h'));

const CCLimitDate = new Date('2021-09-30');

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
  console.log(`OpenJustice - Start "import" job:`, new Date().toLocaleString());
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
    await syncJurinet();
  } catch (e) {
    console.error('Jurinet sync2 error', e);
  }
  try {
    await syncJurica();
  } catch (e) {
    console.error('Jurica sync2 error', e);
  }
  console.log('OpenJustice - End "import" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function importJurinet() {
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

  let jurinetResult = await jurinetSource.getNew(1);

  try {
    const exceptions = await JudilibreIndex.find('exceptions', {
      decisionId: /^jurinet:/,
      collected: false,
      published: false,
      reason: { $ne: null },
    });
    if (exceptions !== null) {
      if (Array.isArray(jurinetResult) === false) {
        jurinetResult = [];
      }
      for (let i = 0; i < exceptions.length; i++) {
        try {
          console.log(`found exception ${exceptions[i].decisionId}`);
          const _row = await jurinetSource.getDecisionByID(exceptions[i].decisionId.split(':')[1]);
          if (_row) {
            console.log(`adding exception ${_row._id}`);
            jurinetResult.push(_row);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (jurinetResult) {
    console.log(`Jurinet has ${jurinetResult.length} new decision(s)`);

    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let tooOld = false;
      let tooEarly = false;
      let hasException = false;
      let exception = null;
      // SKIP CA AND OTHER STUFF
      if (
        row['TYPE_ARRET'] === 'CC' ||
        (row['TYPE_ARRET'] === 'AUTRE' &&
          (/^t\.cfl$/i.test(row['ID_CHAMBRE']) === true || /judiciaire.*paris$/i.test(row['JURIDICTION'])))
      ) {
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
        } catch (ignore) { }
        let raw = await rawJurinet.findOne({ _id: row._id });
        if (raw === null) {
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
          } catch (ignore) { }
          try {
            let inDate = new Date(Date.parse(row.DT_DECISION.toISOString()));
            inDate.setHours(inDate.getHours() + 2);
            if (inDate.getTime() < CCLimitDate.getTime()) {
              tooOld = true;
            }

            const dateDiff2 = DateTime.fromJSDate(inDate).diffNow('days').toObject();
            if (dateDiff2.days > 1) {
              tooEarly = true;
            }

            if (tooOld === true && hasException === false) {
              throw new Error(
                `Cannot import decision ${row._id} because it is too old (${row.DT_DECISION.toISOString()}).`,
              );
            } else if (tooEarly === true && hasException === false) {
              throw new Error(
                `Cannot import decision ${row._id} because it is too early (${Math.round(dateDiff2.days)} days).`,
              );
            }

            row._indexed = null;
            await rawJurinet.insertOne(row, { bypassDocumentValidation: true });
            // @todo-oddj-dashboard: decision CC brute collectée ('jurinet', row._id)
            CustomLog.log("info", {
              operationName: "ImportJurinetBrute",
              msg: `decision jurinet brute collectée , ${row._id})`,
              data: {
                _id: row._id,
                source: "jurinet",
              },
            });

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
                await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip import (already inserted)');
                console.warn(
                  `Jurinet import issue: { sourceId: ${row._id}, sourceName: 'jurinet' } already inserted...`,
                );
              }
              // @todo-oddj-dashboard: decision CC normalisée (normDec.sourceName, normDec.sourceId) // pour recuperer ici le idMongo de la decision, il faudra refaire un find (sinon j'ai peur qu'il me retourne un undefined)
              CustomLog.log("info", {
                operationName: "ImportJurinet",
                msg: `decision jurinet normalised ${normDec.sourceName}, ${normDec.sourceId}`,
                data: {
                  _id: normDec._id,
                  sourceId: normDec.sourceId,
                  sourceName: normDec.sourceName,
                  registerNumber: normDec.registerNumber,
                  labelStatus: normDec.labelStatus,
                  publishStatus: normDec.publishStatus,
                  jurisdictionName: normDec.jurisdictionName,
                  jurisdictionId: normDec.jurisdictionId
                },
              });

              if (exception && hasException === true) {
                hasException = false;
                try {
                  exception.collected = true;
                  await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
                    bypassDocumentValidation: true,
                  });
                } catch (ignore) { }
              }
            }
          } catch (e) {
            // @todo-oddj-dashboard: erreur de collecte de la decision CC brute ('jurinet', row._id, e)
            CustomLog.log("error", {
              operationName: "ImportJurinetError",
              msg: `Error collecting raw Jurinet decision ${row.__id}, ${e}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
            await jurinetSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJurinetDocument(row, null, null, e);
            errorCount++;
          }
        } else if (hasException === true) {
          CustomLog.log("info", {
            operationName: "ImportJurinetAlreadyInserted",
            msg: `Jurinet overwrite already inserted CC decision ${row._id}`,
            data: {
              sourceId: row._id,
              sourceName: 'jurinet',
            }
          });
          try {
            row._indexed = null;
            await rawJurinet.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            // @todo-oddj-dashboard: collecte forcée de la decision CC brute ('jurinet', row._id)
            // a voir si besoin de mettre à ce niveau le log ou de le mettre en fin du try
            CustomLog.log("info", {
              operationName: "ImportJurinet",
              msg: `Collect forced raw jurinet decision ${row._id}`,
              data: {
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            let normDec = await JurinetUtils.Normalize(row);
            normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            newCount++;
            if (normalized === null) {
              const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              normDec._id = insertResult.insertedId;
              await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
              await jurinetSource.markAsImported(row._id);
              if (row['TYPE_ARRET'] !== 'CC') {
                wincicaCount++;
              }
            } else {
              await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip import (already inserted)');
              console.warn(
                `Jurinet import issue: normalized decision { sourceId: ${row._id}, sourceName: 'jurinet' } already inserted...`,
              );
              normDec.zoning = null;
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              normDec.labelStatus = 'toBeTreated';
              normDec.publishStatus = 'toBePublished';
              normDec.labelTreatments = [];
              await decisions.replaceOne({ _id: normalized._id }, normDec, {
                bypassDocumentValidation: true,
              });
              await jurinetSource.markAsImported(row._id);
              // @todo-oddj-dashboard: decision CC normalisée (normDec.sourceName, normDec.sourceId)
              CustomLog.log("info", {
                operationName: "ImportJurinet",
                msg: `Jurinet decision normalised ${normDec.sourceName}, ${normDec.sourceId
                  }`,
                data: {
                  _id: normDec._id,
                  sourceId: normDec.sourceId,
                  sourceName: normDec.sourceName,
                  registerNumber: normDec.registerNumber,
                  labelStatus: normDec.labelStatus,
                  publishStatus: normDec.publishStatus,
                  jurisdictionName: normDec.jurisdictionName,
                  jurisdictionId: normDec.jurisdictionId
                },
              });
            }

            if (exception && hasException === true) {
              hasException = false;
              try {
                exception.collected = true;
                await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
                  bypassDocumentValidation: true,
                });
              } catch (ignore) { }
            }
          } catch (e) {
            // @todo-oddj-dashboard: erreur de collecte forcée de la decision CC brute ('jurinet', row._id, e)
            CustomLog.log("error", {
              operationName: "ImportJurinetError",
              msg: `Error collecting raw Jurinet decision ${row._id}, ${e})`,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
            await jurinetSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJurinetDocument(row, null, null, e);
            errorCount++;
          }
        } else {
          CustomLog.log("info", {
            operationName: "ImportJurinetSkip",
            msg: `Jurinet skip already inserted CC decision ${row._id}`
          });
        }
      } else {
        CustomLog.log("info", {
          operationName: "ImportJurinetSkip",
          msg: `Jurinet skip non CC decision ${row._id}`
        });
      }
    }
  } else {
    CustomLog.log("info", {
      operationName: "ImportJurinetSkip",
      msg: `Jurinet has no new decision`
    });
  }

  CustomLog.log("info", {
    operationName: "ImportJurinetSkip",
    msg: `Done Importing Jurinet - New: ${newCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`
  });
  await client.close();
  await jIndexConnection.close();
  await jurinetSource.close();
  await juricaSource.close();
  await GRCOMSource.close();
  return true;
}

async function importJurica() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);

  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

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

  let juricaResult = await juricaSource.getNew(1);

  try {
    const exceptions = await JudilibreIndex.find('exceptions', {
      decisionId: /^jurica:/,
      collected: false,
      published: false,
      reason: { $ne: null },
    });
    if (exceptions !== null) {
      if (Array.isArray(juricaResult) === false) {
        juricaResult = [];
      }
      for (let i = 0; i < exceptions.length; i++) {
        try {
          console.log(`found exception ${exceptions[i].decisionId} `);
          const _row = await juricaSource.getDecisionByID(exceptions[i].decisionId.split(':')[1]);
          if (_row) {
            console.log(`adding exception ${_row._id} `);
            juricaResult.push(_row);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (juricaResult) {
    console.log(`Jurica has ${juricaResult.length} new decision(s)`);

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let tooOld = false;
      let tooEarly = false;
      let hasException = false;
      let exception = null;
      try {
        exception = await JudilibreIndex.findOne('exceptions', {
          decisionId: `jurica:${row._id} `,
          collected: false,
          published: false,
          reason: { $ne: null },
        });
        if (exception !== null) {
          hasException = true;
        }
      } catch (ignore) { }
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          let inDate = new Date();
          if (!row.JDEC_DATE) {
            throw new Error(`Cannot import decision ${row._id} because it has no date(${row.JDEC_DATE}).`);
          }
          let dateDecisionElements = row.JDEC_DATE.split('-');
          inDate.setFullYear(parseInt(dateDecisionElements[0], 10));
          inDate.setMonth(parseInt(dateDecisionElements[1], 10) - 1);
          inDate.setDate(parseInt(dateDecisionElements[2], 10));
          inDate.setHours(0);
          inDate.setMinutes(0);
          inDate.setSeconds(0);
          inDate.setMilliseconds(0);
          inDate = DateTime.fromJSDate(inDate);
          const dateDiff = inDate.diffNow('months').toObject();
          if (dateDiff.months <= -6) {
            // tooOld = true;
          }

          const dateDiff2 = inDate.diffNow('days').toObject();
          if (dateDiff2.days > 1) {
            tooEarly = true;
          }

          if (tooOld === true && hasException === false) {
            throw new Error(
              `Cannot import decision ${row._id} because it is too old(${Math.round(
                Math.abs(dateDiff.months),
              )
              } months).`,
            );
          } else if (tooEarly === true && hasException === false) {
            throw new Error(
              `Cannot import decision ${row._id} because it is too early(${Math.round(dateDiff2.days)} days).`,
            );
          }

          row._indexed = null;
          let duplicate = false;
          let duplicateId = null;
          try {
            duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicateId = `jurinet:${duplicateId} `;
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
            } catch (ignore) { }
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
                  `Cannot process partially - public decision ${row._id
                  } because its text is empty or invalid: ${JSON.stringify(
                    e,
                    e ? Object.getOwnPropertyNames(e) : null,
                  )
                  }.`,
                );
              }
              try {
                zoning = await Juritools.GetZones(row._id, 'ca', trimmedText);
                if (!zoning || zoning.detail) {
                  throw new Error(
                    `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                      zoning,
                      zoning ? Object.getOwnPropertyNames(zoning) : null,
                    )
                    }.`,
                  );
                }
              } catch (e) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                    e,
                    e ? Object.getOwnPropertyNames(e) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no zone: ${JSON.stringify(
                    zoning,
                    zoning ? Object.getOwnPropertyNames(zoning) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones.introduction) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no introduction: ${JSON.stringify(
                    zoning.zones,
                    zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones.dispositif) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no dispositif: ${JSON.stringify(
                    zoning.zones,
                    zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                  )
                  }.`,
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
            // @todo-oddj-dashboard: decision CA brute collectée ('jurica', row._id)
            CustomLog.log("info", {
              operationName: "ImportJuricaBrute",
              msg: `Raw Jurica decision collected ${row._id})`,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
            await JudilibreIndex.indexJuricaDocument(row, duplicateId, 'import in rawJurica');
            await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
            const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
            if (ShouldBeSentToJudifiltre === true) {
              await JudilibreIndex.updateJuricaDocument(row, duplicateId, `IGNORED_CONTROLE_REQUIS`);
              // @todo-oddj-dashboard: decision CA bloquée ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
              CustomLog.log("info", {
                operationName: "ImportJuricaToJudifiltre",
                msg: `Jurica decision blocked ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}) `,
                data: {
                  _id: row._id,
                  sourceId: row._id,
                  jdec_codnac: row.JDEC_CODNAC,
                  jdec_codnacpart: row.JDEC_CODNACPART,
                  jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
                  sourceName: 'jurica',
                },
              });
              const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id} ` });
              if (existingDoc !== null) {
                let dateJudifiltre = DateTime.now();
                existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
                await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
                  bypassDocumentValidation: true,
                });
              }
            }
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized === null) {
              let normDec = await JuricaUtils.Normalize(row);
              normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
              normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
              normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
              normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
              normDec._version = decisionsVersion;
              if (ShouldBeSentToJudifiltre === true) {
                normDec.labelStatus = 'ignored_controleRequis';
                normDec.publishStatus = 'blocked';
              }
              normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
              if (normalized === null) {
                const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                normDec._id = insertResult.insertedId;
                await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
                await juricaSource.markAsImported(row._id);
                newCount++;
              } else {
                await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip import (already inserted)');
                CustomLog.log("info", {
                  operationName: "ImportJuricaSkip",
                  msg: `Jurica import issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`,
                });
              }
              // @todo-oddj-dashboard: decision CA normalisée (normDec.sourceName, normDec.sourceId)
              CustomLog.log("info", {
                operationName: "ImportJurica",
                msg: `Jurica decision normalised ${normDec.sourceName}, ${normDec.sourceId}`,
                data: {
                  _id: normDec._id,
                  sourceId: normDec.sourceId,
                  sourceName: normDec.sourceName,
                  registerNumber: normDec.registerNumber,
                  labelStatus: normDec.labelStatus,
                  publishStatus: normDec.publishStatus,
                  jurisdictionName: normDec.jurisdictionName,
                  jurisdictionId: normDec.jurisdictionId
                },
              });
              if (exception && hasException === true) {
                hasException = false;
                try {
                  exception.collected = true;
                  await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
                    bypassDocumentValidation: true,
                  });
                } catch (ignore) { }
              }
            } else {
              CustomLog.log("info", {
                operationName: "ImportJuricaSkip",
                msg: `Jurica import anomaly: decision ${row._id} seems new but related SDER record ${normalized._id} already exists.`,
              });
              await JudilibreIndex.updateJuricaDocument(row, null, `SDER record ${normalized._id} already exists`);
              await juricaSource.markAsImported(row._id);
              errorCount++;
            }
          } else {
            // @todo-oddj-dashboard: decision CA rejetée ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
            CustomLog.log("info", {
              operationName: "ImportJuricaRejected",
              msg: `Jurica import reject decision ${row._id} (ShouldBeRejected: ${ShouldBeRejected}, duplicate: ${duplicate}), ${row._id}, ${row
                .JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.J
                  .DEC_IND_DEC_PUB})`,
              data: {
                _id: row._id,
                sourceId: row._id,
                jdec_codnac: JDEC_CODNAC,
                jdec_codnacpart: JDEC_CODNACPART,
                jdec_ind_dec_pub: JDEC_IND_DEC_PUB,
                sourceName: 'jurica',
              },
            },
            );
            await juricaSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJuricaDocument(
              row,
              duplicateId,
              duplicate ? `duplicate of ${duplicateId} ` : 'non-public',
            );
            if (duplicate) {
              duplicateCount++;
            } else {
              nonPublicCount++;
            }
          }
        } catch (e) {
          // @todo-oddj-dashboard: erreur de collecte de la decision CA brute ('jurica', row._id, e)
          CustomLog.log("error", {
            operationName: "ImportJuricaError",
            msg: `Error collecting raw Jurica decision ${row._id}, ${e})`,
            data: {
              sourceId: row._id,
              sourceName: 'jurica',
            },
          });
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          errorCount++;
        }
      } else if (hasException === true) {
        CustomLog.log("info", {
          operationName: "ImportJuricaSkip",
          msg: `Jurica overwrite already inserted CA decision ${row._id} `,
        });
        try {
          row._indexed = null;
          await rawJurica.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
          let duplicate = false;
          let duplicateId = null;
          try {
            duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicateId = `jurinet:${duplicateId} `;
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
            } catch (ignore) { }
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
                  `Cannot process partially - public decision ${row._id
                  } because its text is empty or invalid: ${JSON.stringify(
                    e,
                    e ? Object.getOwnPropertyNames(e) : null,
                  )
                  }.`,
                );
              }
              try {
                zoning = await Juritools.GetZones(row._id, 'ca', trimmedText);
                if (!zoning || zoning.detail) {
                  throw new Error(
                    `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                      zoning,
                      zoning ? Object.getOwnPropertyNames(zoning) : null,
                    )
                    }.`,
                  );
                }
              } catch (e) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                    e,
                    e ? Object.getOwnPropertyNames(e) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no zone: ${JSON.stringify(
                    zoning,
                    zoning ? Object.getOwnPropertyNames(zoning) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones.introduction) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no introduction: ${JSON.stringify(
                    zoning.zones,
                    zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                  )
                  }.`,
                );
              }
              if (!zoning.zones.dispositif) {
                throw new Error(
                  `Cannot process partially - public decision ${row._id} because it has no dispositif: ${JSON.stringify(
                    zoning.zones,
                    zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
                  )
                  }.`,
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
            // @todo-oddj-dashboard: collecte forcée de la decision CA brute ('jurica', row._id)
            CustomLog.log("info", {
              operationName: "ImportJuricaForcedBrute",
              msg: `Raw Jurica decision collected ${row._id}, ${e})`,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
            await JuricaUtils.IndexAffaire(row, jIndexMain, jIndexAffaires, jurinetSource.connection);
            const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
              row.JDEC_CODNAC,
              row.JDEC_CODNACPART,
              row.JDEC_IND_DEC_PUB,
            );
            if (ShouldBeSentToJudifiltre === true) {
              // @todo-oddj-dashboard: decision CA bloquée ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
              CustomLog.log("info", {
                operationName: "ImportJuricaToJudifiltre",
                msg: `Jurica decision blocked ${row._id}, ${row.JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.JDEC_IND_DEC_PUB}`,
                data: {
                  _id: row._id,
                  sourceId: row._id,
                  jdec_codnac: JDEC_CODNAC,
                  jdec_codnacpart: JDEC_CODNACPART,
                  jdec_ind_dec_pub: JDEC_IND_DEC_PUB,
                  sourceName: 'jurica',
                },
              });
              await JudilibreIndex.updateJuricaDocument(row, duplicateId, `IGNORED_CONTROLE_REQUIS`);
              const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id} ` });
              if (existingDoc !== null) {
                let dateJudifiltre = DateTime.now();
                existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
                await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
                  bypassDocumentValidation: true,
                });
              }
            }
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            newCount++;
            let normDec = await JuricaUtils.Normalize(row);
            normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
            normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
            normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
            normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
            normDec._version = decisionsVersion;
            if (ShouldBeSentToJudifiltre === true) {
              normDec.labelStatus = 'ignored_controleRequis';
              normDec.publishStatus = 'blocked';
            }
            normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized === null) {
              const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              normDec._id = insertResult.insertedId;
              await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions');
              await juricaSource.markAsImported(row._id);
            } else {
              await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip import (already inserted)');
              CustomLog.log("info", {
                operationName: "ImportJuricaSkip",
                msg: `Jurica import issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`,
              });
              normDec.zoning = null;
              normDec.pseudoText = undefined;
              normDec.pseudoStatus = 0;
              if (ShouldBeSentToJudifiltre === true) {
                normDec.labelStatus = 'ignored_controleRequis';
                normDec.publishStatus = 'blocked';
              } else {
                normDec.labelStatus = 'toBeTreated';
                normDec.publishStatus = 'toBePublished';
                await juricaSource.markAsImported(row._id);
              }
              normDec.labelTreatments = [];
              await decisions.replaceOne({ _id: normalized._id }, normDec, {
                bypassDocumentValidation: true,
              });
            }
            // @todo-oddj-dashboard: decision CA normalisée (normDec.sourceName, normDec.sourceId)
            CustomLog.log("info", {
              operationName: "ImportJurica",
              msg: `Jurica normalised decision ${normDec.sourceName}, ${normDec.sourceId})`,
              data: {
                _id: normDec._id,
                sourceId: normDec.sourceId,
                sourceName: normDec.sourceName,
                jurisdictionId: normDec.jurisdictionId,
                jurisdictionName: normDec.jurisdictionName,
                labelStatus: normDec.labelStatus,
                publishStatus: normDec.publishStatus
              },
            });
            if (exception && hasException === true) {
              hasException = false;
              try {
                exception.collected = true;
                await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
                  bypassDocumentValidation: true,
                });
              } catch (ignore) { }
            }
          } else {
            // @todo-oddj-dashboard: decision CA rejetée ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
            CustomLog.log("info", {
              operationName: "ImportJuricaRejected",
              msg: `Jurica import reject decision ${row._id}, ${row
                .JDEC_CODNAC}, ${row.JDEC_CODNACPART}, ${row.J
                  .DEC_IND_DEC_PUB} ShouldBeRejected: ${ShouldBeRejected}, duplicate: ${duplicate}`,
              data: {
                _id: row._id,
                jdec_codnac: JDEC_CODNAC,
                jdec_codnacpart: JDEC_CODNACPART,
                jdec_ind_dec_pub: JDEC_IND_DEC_PUB,
                sourceId: row._id,
                sourceName: 'jurica',
              },
            });
            await juricaSource.markAsErroneous(row._id);
            await JudilibreIndex.updateJuricaDocument(
              row,
              duplicateId,
              duplicate ? `duplicate of ${duplicateId} ` : 'non-public',
            );
            if (duplicate) {
              duplicateCount++;
            } else {
              nonPublicCount++;
            }
          }
        } catch (e) {
          // @todo-oddj-dashboard: erreur de collecte forcée de la decision CA brute ('jurica', row._id, e)
          CustomLog.log("error", {
            operationName: "ImportJuricaError",
            msg: `Error colllecting raw jurica decision ${row._id}, ${e}`,
            data: {
              _id: row._id,
              sourceId: row._id,
              sourceName: 'jurica',
            },
          });
          await juricaSource.markAsErroneous(row._id);
          await JudilibreIndex.updateJuricaDocument(row, null, null, e);
          errorCount++;
        }
      } else {
        CustomLog.log("error", {
          operationName: "ImportJuricaError",
          msg: `Jurica skip already inserted CA decision ${row._id}`
        });
      }
    }
  }

  CustomLog.log("info", {
    operationName: "ImportJuricaSkip",
    msg: `Done Importing Jurica - New: ${newCount}, Non - public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`
  });
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
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const juricaSource = new JuricaOracle();
    await juricaSource.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURINET_COLLECTION);
    const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI);
    await jIndexConnection.connect();
    const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
    const jIndexMain = jIndexClient.collection('mainIndex');
    const jIndexAffaires = jIndexClient.collection('affaires');

    const GRCOMSource = new GRCOMOracle();
    await GRCOMSource.connect();

    CustomLog.log("info", {
      operationName: "ImportJurinetSkip",
      msg: `Syncing Jurinet(${jurinetResult.length} decisions modified since ${jurinetLastDate.toISODate()})...`,
    });

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let wincicaCount = 0;
    let errorCount = 0;
    const changelog = {};
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      // SKIP CA AND OTHER STUFF
      if (
        row['TYPE_ARRET'] === 'CC' ||
        (row['TYPE_ARRET'] === 'AUTRE' &&
          (/^t\.cfl$/i.test(row['ID_CHAMBRE']) === true || /judiciaire.*paris$/i.test(row['JURIDICTION'])))
      ) {
        let rawDocument = await raw.findOne({ _id: row._id });
        let updated = false;
        let diffCount = 0;
        let anomalyUpdated = false;
        let reprocessUpdated = false;
        let tooOld = false;
        let tooEarly = false;
        let hasException = false;
        let hasExceptionToReprocess = false;
        let exception = null;
        try {
          exception = await JudilibreIndex.findOne('exceptions', {
            decisionId: `jurinet:${row._id} `,
            collected: false,
            published: false,
            reason: { $ne: null },
          });
          if (exception !== null) {
            hasException = true;
            if (exception.resetPseudo === true) {
              hasExceptionToReprocess = true;
            }
          }
        } catch (ignore) { }
        if (rawDocument === null) {
          try {
            row._indexed = null;
            await raw.insertOne(row, { bypassDocumentValidation: true });
            // @todo-oddj-dashboard: decision CC brute collectée suite à une mise à jour ('jurinet', row._id)
            CustomLog.log("info", {
              operationName: "ImportJurinetBrute",
              msg: `Raw Jurinet decision collected following an update ${row._id}`,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: 'jurinet',
              },
            });
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
            // '_nao_code',
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
            'XML',
            'OCCULTATION_SUPPLEMENTAIRE',
            '_bloc_occultation',
            '_natureAffaireCivil',
            '_natureAffairePenal',
            '_codeMatiereCivil',
            // '_nao_code',
          ];
          const sensitive = ['XML', '_partie', 'OCCULTATION_SUPPLEMENTAIRE'];
          const doNotCount = ['DT_ANO', 'DT_MODIF', 'DT_MODIF_ANO', 'DT_ENVOI_DILA'];
          diff.forEach((key) => {
            if (key === 'XML') {
              let oldXml = null;
              try {
                oldXml = JurinetUtils.CleanXML(rawDocument.XML);
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
                    old: JSON.stringify(rawDocument[key]),
                    new: JSON.stringify(row[key]),
                  };
                }
                if (anomaly.indexOf(key) !== -1) {
                  anomalyUpdated = true;
                }
                if (reprocess.indexOf(key) !== -1) {
                  reprocessUpdated = true;
                }
              }
            } else if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
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
                  old: JSON.stringify(rawDocument[key]),
                  new: JSON.stringify(row[key]),
                };
              }
              if (anomaly.indexOf(key) !== -1) {
                anomalyUpdated = true;
              }
              if (reprocess.indexOf(key) !== -1) {
                reprocessUpdated = true;
              }
            }
          });
          if (updated === true && diffCount > 0) {
            try {
              let inDate = new Date(Date.parse(row.DT_DECISION.toISOString()));
              inDate.setHours(inDate.getHours() + 2);
              if (inDate.getTime() < CCLimitDate.getTime()) {
                tooOld = true;
              }

              const dateDiff2 = DateTime.fromJSDate(inDate).diffNow('days').toObject();
              if (dateDiff2.days > 1) {
                tooEarly = true;
              }

              if (tooOld === true && hasException === false) {
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
                // @todo-oddj-dashboard: mise à jour ignorée car la décision CC est trop ancienne ('jurinet', row._id, changelog*
                CustomLog.log("info", {
                  operationName: "ImportJurinetTooOld",
                  msg: `Jurinet decision update ignored because the decision is too old ${row._id}`,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: 'jurinet',
                  },
                });
                await JudilibreIndex.updateJurinetDocument(
                  row,
                  null,
                  `update in rawJurinet (sync2) - Skip decision (too old: ${row.DT_DECISION.toISOString()}) - changelog: ${JSON.stringify(
                    changelog,
                  )}`,
                );
              } else if (tooEarly === true && hasException === false) {
                updateCount++;
                if (row['TYPE_ARRET'] !== 'CC') {
                  wincicaCount++;
                }
                // @todo-oddj-dashboard: mise à jour ignorée car la décision CC est trop en avance ('jurinet', row._id, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJurinetFutur",
                  msg: `Jurinet decision update ignored because the decision is too far in the future ${row._id} changelog ${changelog}`,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: 'jurinet',
                  },
                });
                await JudilibreIndex.updateJurinetDocument(
                  row,
                  null,
                  `update in rawJurinet (sync2) - Skip decision (too early: ${Math.round(
                    dateDiff2.days,
                  )} days) - changelog: ${JSON.stringify(changelog)}`,
                );
              } else {
                row._indexed = null;
                if (reprocessUpdated === true || hasExceptionToReprocess === true) {
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
                    `update in rawJurinet(sync2) - Original text could have been changed - changelog: ${JSON.stringify(
                      changelog,
                    )
                    } `,
                  );
                } else if (Object.keys(changelog).length > 0) {
                  await JudilibreIndex.updateJurinetDocument(
                    row,
                    null,
                    `update in rawJurinet(sync2) - changelog: ${JSON.stringify(changelog)} `,
                  );
                }
                // @todo-oddj-dashboard: décision CC brute mise à jour ('jurinet', row._id, changelog)
                // peut on concidérer qu'une décision mise à jour reste quand même une décision collectée ?
                CustomLog.log("info", {
                  operationName: "ImportJurinetBrute",
                  msg: `Raw Jurinet decision collected following an update ${row._id} changelog ${changelog}`,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: 'jurinet',
                  },
                });
              }
            } catch (e) {
              // @todo-oddj-dashboard: erreur de la mise à jour de la decision CC brute ('jurinet', row._id, changelog, e)
              CustomLog.log("error", {
                operationName: "ImportJurinetError",
                msg: `Error updating raw CC decision ${row._id} changelog ${JSON.stringify(changelog)} `,
                data: {
                  _id: row._id,
                  sourceId: row._id,
                  sourceName: 'jurinet',
                },
              });
              updated = false;
              console.error(e);
              await JudilibreIndex.updateJurinetDocument(
                row,
                null,
                `error while updating in rawJurinet(sync2) - changelog: ${JSON.stringify(changelog)} `,
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
            if ((tooOld === true || tooEarly === true) && hasException === false) {
              normDec.labelStatus = 'locked';
            }
            normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
            if (normalized === null) {
              const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              normDec._id = insertResult.insertedId;
              await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions (sync2)');
              normalizeCount++;
            } else {
              await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip sync (already inserted)');
              console.warn(`Jurinet sync issue: { sourceId: ${row._id}, sourceName: 'jurinet' } already inserted...`);
            }
            // @todo-oddj-dashboard: decision CC normalisée suite à une mise à jour (normDec.sourceName, normDec.sourceId)
            CustomLog.log("info", {
              operationName: "ImportJurinet",
              msg: `Jurinet normalised decision updating ${normDec.sourceName
                } ${normDec.sourceId}`,
              data: {
                _id: normDec._id,
                sourceId: normDec.sourceId,
                sourceName: normDec.sourceName,
                jurisdictionId: normDec.jurisdictionId,
                jurisdictionName: normDec.jurisdictionName,
                labelStatus: normDec.labelStatus,
                publishStatus: normDec.publishStatus
              }
            });
          } catch (e) {
            // @todo-oddj-dashboard: erreur de normalisation CC suite à une mise à jour ('jurinet', row._id, e)
            CustomLog.log("error", {
              operationName: "ImportJurinetError",
              msg: `Error Normalization for Jurinet following an update ${row._id} ${e}`,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: "jurinet"
              }
            });
            await JudilibreIndex.updateJurinetDocument(row, null, null, e);
            errorCount++;
          }
        } else if (normalized.locked === false) {
          if (updated === true && diffCount > 0) {
            try {
              let normDec = await JurinetUtils.Normalize(row, normalized);
              normDec.originalText = JurinetUtils.removeMultipleSpace(normDec.originalText);
              normDec.originalText = JurinetUtils.replaceErroneousChars(normDec.originalText);
              normDec.pseudoText = JurinetUtils.removeMultipleSpace(normDec.pseudoText);
              normDec.pseudoText = JurinetUtils.replaceErroneousChars(normDec.pseudoText);
              normDec.publishStatus = 'toBePublished';
              normDec._version = decisionsVersion;
              normDec.dateCreation = new Date().toISOString();
              normDec.zoning = null;
              if ((tooOld === true || tooEarly === true) && hasException === false) {
                normDec.labelStatus = 'locked';
              } else if (reprocessUpdated === true || hasExceptionToReprocess === true) {
                normDec.pseudoText = undefined;
                normDec.pseudoStatus = 0;
                normDec.labelStatus = 'toBeTreated';
                normDec.labelTreatments = [];
                await jurinetSource.markAsImported(row._id);
              }
              await decisions.replaceOne({ _id: normalized._id }, normDec, {
                bypassDocumentValidation: true,
              });
              normDec._id = normalized._id;
              if (reprocessUpdated === true && ((tooOld === false && tooEarly === false) || hasException === true)) {
                // @todo-oddj-dashboard: mise à jour de la décision CC normalisée et retraitement par Label (normDec.sourceName, normDec.sourceId, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJurinet",
                  msg: `Normalized Jurinet decision updated and reprocessed by Label ${normDec.sourceName} ${normDec.sourceId}  - changelog : ${changelog}`,
                  data: {
                    _id: normDec._id,
                    sourceId: normDec.sourceId,
                    sourceName: normDec.sourceName,
                    jurisdictionId: normDec.jurisdictionId,
                    jurisdictionName: normDec.jurisdictionName,
                    labelStatus: normDec.labelStatus,
                    publishStatus: normDec.publishStatus
                  }
                });
                await JudilibreIndex.indexDecisionDocument(
                  normDec,
                  null,
                  `update in decisions and reprocessed(sync2) - changelog: ${JSON.stringify(changelog)} `,
                );
              } else if (Object.keys(changelog).length > 0) {
                // @todo-oddj-dashboard: mise à jour de la décision CC normalisée *sans* retraitement par Label (normDec.sourceName, normDec.sourceId, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJurinet",
                  msg: `Normalized Jurinet decision updated without reprocessed by Label ${normDec.sourceName} ${normDec.sourceId}  - changelog : ${changelog}`,
                  data: {
                    _id: normDec._id,
                    sourceId: normDec.sourceId,
                    sourceName: normDec.sourceName,
                    jurisdictionId: normDec.jurisdictionId,
                    jurisdictionName: normDec.jurisdictionName,
                    labelStatus: normDec.labelStatus,
                    publishStatus: normDec.publishStatus
                  }
                });
                await JudilibreIndex.updateDecisionDocument(
                  normDec,
                  null,
                  `update in decisions(sync2) - changelog: ${JSON.stringify(changelog)} `,
                );
              }
              normalizeCount++;
            } catch (e) {
              // @todo-oddj-dashboard: erreur de normalisation CC suite à une mise à jour (normalized.sourceName, normalized.sourceId, changelog, e)
              CustomLog.log("error", {
                operationName: "ImportJurinetError",
                msg: `Error Normalization for Jurinet following an update ${normalized.sourceName} ${normalized.sourceId}  - changelog : ${changelog} - ${e}`,
                data: {
                  _id: normalized._id,
                  sourceId: normDec.sourceId,
                  sourceName: normDec.sourceName
                }
              });
              console.error(e);
              await JudilibreIndex.updateDecisionDocument(normalized, null, null, e);
              errorCount++;
            }
          }
        }

        if (exception && hasException === true) {
          hasException = false;
          hasExceptionToReprocess = false;
          try {
            exception.collected = true;
            await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
              bypassDocumentValidation: true,
            });
          } catch (ignore) { }
        }

        let existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurinet:${row._id} ` });
        if (existingDoc === null) {
          rawDocument = await raw.findOne({ _id: row._id });
          normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (rawDocument && normalized) {
            const indexedDoc = await JudilibreIndex.buildJurinetDocument(rawDocument, null);
            indexedDoc.sderId = normalized._id;
            if (rawDocument._indexed === true) {
              indexedDoc.judilibreId = normalized._id.valueOf();
              if (typeof indexedDoc.judilibreId !== 'string') {
                indexedDoc.judilibreId = `${indexedDoc.judilibreId} `;
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
    }
    await juricaSource.close();
    await jIndexConnection.close();
    await GRCOMSource.close();
    await client.close();

    CustomLog.log("info", {
      operationName: "ImportJurinetSkip",
      msg: `Done Syncing Jurinet - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
    });
  } else {
    CustomLog.log("info", {
      operationName: "ImportJurinetSkip",
      msg: `Done Syncing Jurinet - Empty round.`,
    });
  }

  try {
    fs.writeFileSync(path.join(__dirname, 'data', 'jurinet.lastDate'), jurinetLastDate.toISO());
  } catch (e) {
    console.error(e);
  }

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

  if (juricaResult) {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
    CustomLog.log("info", {
      operationName: "ImportJuricaSkip",
      msg: `Syncing Jurica(${juricaResult.length} decisions modified since ${juricaLastDate.toISODate()})...`,
    });

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let duplicateCount = 0;
    let nonPublicCount = 0;
    let errorCount = 0;
    const changelog = {};

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;
      let diffCount = 0;
      let anomalyUpdated = false;
      let reprocessUpdated = false;
      let duplicate = false;
      let duplicateId = null;
      let tooOld = false;
      let tooEarly = false;
      let hasException = false;
      let hasExceptionToReprocess = false;
      let exception = null;
      try {
        exception = await JudilibreIndex.findOne('exceptions', {
          decisionId: `jurica:${row._id} `,
          collected: false,
          published: false,
          reason: { $ne: null },
        });
        if (exception !== null) {
          hasException = true;
          if (exception.resetPseudo === true) {
            hasExceptionToReprocess = true;
          }
        }
      } catch (ignore) { }
      try {
        duplicateId = await JuricaUtils.GetJurinetDuplicate(row._id);
        if (duplicateId !== null) {
          duplicateId = `jurinet:${duplicateId} `;
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
        } catch (ignore) { }
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
              `Cannot process partially - public decision ${row._id
              } because its text is empty or invalid: ${JSON.stringify(e, e ? Object.getOwnPropertyNames(e) : null)}.`,
            );
          }
          try {
            zoning = await Juritools.GetZones(row._id, 'ca', trimmedText);
            if (!zoning || zoning.detail) {
              throw new Error(
                `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                  zoning,
                  zoning ? Object.getOwnPropertyNames(zoning) : null,
                )
                }.`,
              );
            }
          } catch (e) {
            throw new Error(
              `Cannot process partially - public decision ${row._id} because its zoning failed: ${JSON.stringify(
                e,
                e ? Object.getOwnPropertyNames(e) : null,
              )
              }.`,
            );
          }
          if (!zoning.zones) {
            throw new Error(
              `Cannot process partially - public decision ${row._id} because it has no zone: ${JSON.stringify(
                zoning,
                zoning ? Object.getOwnPropertyNames(zoning) : null,
              )
              }.`,
            );
          }
          if (!zoning.zones.introduction) {
            throw new Error(
              `Cannot process partially - public decision ${row._id} because it has no introduction: ${JSON.stringify(
                zoning.zones,
                zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
              )
              }.`,
            );
          }
          if (!zoning.zones.dispositif) {
            throw new Error(
              `Cannot process partially - public decision ${row._id} because it has no dispositif: ${JSON.stringify(
                zoning.zones,
                zoning.zones ? Object.getOwnPropertyNames(zoning.zones) : null,
              )
              }.`,
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
        const ShouldBeSentToJudifiltre = await JuricaUtils.ShouldBeSentToJudifiltre(
          row.JDEC_CODNAC,
          row.JDEC_CODNACPART,
          row.JDEC_IND_DEC_PUB,
        );
        if (ShouldBeSentToJudifiltre === true) {
          await JudilibreIndex.updateJuricaDocument(row, duplicateId, `IGNORED_CONTROLE_REQUIS`);
          // @todo-oddj-dashboard: decision CA bloquée suite à une mise à jour ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
          CustomLog.log("info", {
            operationName: "ImportJuricaToJudifiltre",
            msg: `Jurica decision blocked following an update ${row._id} ${row.JDEC_CODNAC} ${row.JDEC_CODNACPART} ${row.JDEC_IND_DEC_PUB}`,
            data: {
              _id: row._id,
              sourceId: row._id,
              jdec_codnac: JDEC_CODNAC,
              jdec_codnacpart: JDEC_CODNACPART,
              jdec_ind_dec_pub: JDEC_IND_DEC_PUB,
              sourceName: "jurica"
            }
          });
          const existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id} ` });
          if (existingDoc !== null) {
            let dateJudifiltre = DateTime.now();
            existingDoc.dateJudifiltre = dateJudifiltre.toISODate();
            await JudilibreIndex.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, {
              bypassDocumentValidation: true,
            });
          }
        }
        if (rawDocument === null) {
          try {
            row._indexed = null;
            if (ShouldBeSentToJudifiltre === true) {
              row._indexed = false;
            }
            await raw.insertOne(row, { bypassDocumentValidation: true });
            // @todo-oddj-dashboard: decision CA brute collectée suite à une mise à jour ('jurica', row._id)
            CustomLog.log("info", {
              operationName: "ImportJuricaBrute",
              msg: `Raw Jurica decision collected following an update ${row._id} `,
              data: {
                _id: row._id,
                sourceId: row._id,
                sourceName: "jurica"
              }
            });
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
          const anomaly = ['JDEC_HTML_SOURCE'];
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
          ];
          const sensitive = ['JDEC_HTML_SOURCE', 'JDEC_COLL_PARTIES', 'JDEC_OCC_COMP_LIBRE'];
          const doNotCount = ['JDEC_DATE_MAJ', 'DT_ENVOI_ABONNES'];
          diff.forEach((key) => {
            if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
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
                  old: JSON.stringify(rawDocument[key]),
                  new: JSON.stringify(row[key]),
                };
              }
              if (anomaly.indexOf(key) !== -1) {
                anomalyUpdated = true;
              }
              if (reprocess.indexOf(key) !== -1) {
                reprocessUpdated = true;
              }
            }
          });

          if (updated === true && diffCount > 0) {
            try {
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
              const dateDiff = inDate.diffNow('months').toObject();
              if (dateDiff.months <= -6) {
                // tooOld = true;
              }

              const dateDiff2 = inDate.diffNow('days').toObject();
              if (dateDiff2.days > 1) {
                tooEarly = true;
              }

              if (tooOld === true && hasException === false) {
                // @todo-oddj-dashboard: mise à jour ignorée car la décision CA est trop ancienne ('jurica', row._id, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJuricaTooOld",
                  msg: `Ignored jurica decision collected following an update because too old ${row._id} `,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: "jurica"
                  }
                });
                updateCount++;
                await JudilibreIndex.updateJuricaDocument(
                  row,
                  duplicateId,
                  `update in rawJurica(sync2) - Skip decision(too old) - changelog: ${JSON.stringify(changelog)} `,
                );
              } else if (tooEarly === true && hasException === false) {
                // @todo-oddj-dashboard: mise à jour ignorée car la décision CA est trop en avance ('jurica', row._id, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJuricaFutur",
                  msg: `Ignored jurica decision collected following an update because too recent (future)${row._id} changelog : ${changelog} `,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: "jurica"
                  }
                });
                updateCount++;
                await JudilibreIndex.updateJuricaDocument(
                  row,
                  duplicateId,
                  `update in rawJurica(sync2) - Skip decision(too early) - changelog: ${JSON.stringify(changelog)} `,
                );
              } else {
                row._indexed = null;
                if (ShouldBeSentToJudifiltre === true) {
                  row._indexed = false;
                }
                if (reprocessUpdated === true || hasExceptionToReprocess === true) {
                  row.IND_ANO = 0;
                  row.HTMLA = null;
                }
                await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
                if (anomalyUpdated === true) {
                  await JudilibreIndex.updateJuricaDocument(
                    row,
                    duplicateId,
                    `update in rawJurica(sync2) - Original text could have been changed - changelog: ${JSON.stringify(
                      changelog,
                    )
                    } `,
                  );
                } else if (Object.keys(changelog).length > 0) {
                  await JudilibreIndex.updateJuricaDocument(
                    row,
                    duplicateId,
                    `update in rawJurica(sync2) - changelog: ${JSON.stringify(changelog)} `,
                  );
                }
                // @todo-oddj-dashboard: décision CA brute mise à jour ('jurica', row._id, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJuricaBrute",
                  msg: `Raw Jurica decision collected following an update ${row._id} changelog: ${changelog}`,
                  data: {
                    _id: row._id,
                    sourceId: row._id,
                    sourceName: "jurica"
                  }
                });
                updateCount++;
              }
            } catch (e) {
              // @todo-oddj-dashboard: erreur de la mise à jour de la decision CA brute ('jurica', row._id, changelog, e)
              CustomLog.log("error", {
                operationName: "ImportJuricaError",
                msg: `Error following an update  ${row._id} - changelog: ${changelog} - erreur: ${e} `,
                data: {
                  _id: row._id,
                  sourceId: row._id,
                  sourceName: "jurica"
                }
              });
              updated = false;
              console.error(e);
              await JudilibreIndex.updateJuricaDocument(
                row,
                duplicateId,
                `error while updating in rawJurica(sync2) - changelog: ${JSON.stringify(changelog)} `,
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
            if (ShouldBeSentToJudifiltre === true) {
              normDec.labelStatus = 'ignored_controleRequis';
              normDec.publishStatus = 'blocked';
            } else {
              if (duplicate === true) {
                normDec.labelStatus = 'exported';
              }
              if ((tooOld === true || tooEarly === true) && hasException === false) {
                normDec.labelStatus = 'locked';
              }
            }
            normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized === null) {
              const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              normDec._id = insertResult.insertedId;
              await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions (sync2)');
              normalizeCount++;
            } else {
              await JudilibreIndex.updateDecisionDocument(normalized, null, 'skip import (already inserted)');
              CustomLog.log("info", {
                operationName: "ImportJuricaSkip",
                msg: `Jurica sync issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`,
              });
            }
            // @todo-oddj-dashboard: decision CA normalisée suite à une mise à jour (normDec.sourceName, normDec.sourceId)
            CustomLog.log("info", {
              operationName: "ImportJurica",
              msg: `Jurica decision normalised folllowing an update ${row._id} ${normDec.sourceName} ${normDec.sourceId}`,
              data: {
                _id: normalized._id,
                sourceId: normDec.sourceId,
                sourceName: normDec.sourceName,
                labelStatus: normDec.labelStatus,
                publishStatus: normDec.publishStatus,
                jurisdictionId: normDec.jurisdictionId,
                jurisdictionName: normDec.jurisdictionName
              }
            });
          } catch (e) {
            // @todo-oddj-dashboard: erreur de normalisation CA suite à une mise à jour ('jurica', row._id, e)
            CustomLog.log("error", {
              operationName: "ImportJuricaError",
              msg: `Error normalization following an update ${row._id} - erreur: ${e} `,
              data: {
                _id: normalized._id,
                sourceId: row._id,
                sourceName: "jurica"
              }
            });
            console.error(e);
            await JudilibreIndex.updateJuricaDocument(row, null, null, e);
            errorCount++;
          }
        } else if (normalized.locked === false) {
          if (updated === true && diffCount > 0) {
            try {
              let normDec = await JuricaUtils.Normalize(row, normalized);
              normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
              normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
              normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
              normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
              normDec._version = decisionsVersion;
              normDec.dateCreation = new Date().toISOString();
              if (ShouldBeSentToJudifiltre === true) {
                normDec.labelStatus = 'ignored_controleRequis';
                normDec.publishStatus = 'blocked';
              } else {
                normDec.publishStatus = 'toBePublished';
                if ((tooOld === true || tooEarly === true) && hasException === false) {
                  normDec.labelStatus = 'locked';
                } else if (reprocessUpdated === true || hasExceptionToReprocess === true) {
                  normDec.pseudoText = undefined;
                  normDec.pseudoStatus = 0;
                  normDec.labelStatus = 'toBeTreated';
                  normDec.labelTreatments = [];
                  normDec.zoning = null;
                  await juricaSource.markAsImported(row._id);
                } else if (duplicate === true) {
                  normDec.labelStatus = 'exported';
                }
              }
              await decisions.replaceOne({ _id: normalized._id }, normDec, {
                bypassDocumentValidation: true,
              });
              normDec._id = normalized._id;
              if (reprocessUpdated === true && ((tooOld === false && tooEarly === false) || hasException === true)) {
                // @todo-oddj-dashboard: mise à jour de la décision CA normalisée et retraitement par Label (normDec.sourceName, normDec.sourceId, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJurica",
                  msg: `Normalized Jurinca decision updated and reprocessed by Label ${normDec.sourceId} ${normDec.sourceName} changelog : ${changelog} `,
                  data: {
                    _id: normDec._id,
                    sourceId: normDec.sourceId,
                    sourceName: normDec.sourceName,
                    jurisdictionId: normDec.jurisdictionId,
                    jurisdictionName: normDec.jurisdictionName,
                    labelStatus: normDec.labelStatus,
                    publishStatus: normDec.publishStatus
                  }
                });
                await JudilibreIndex.indexDecisionDocument(
                  normDec,
                  duplicateId,
                  `update in decisions and reprocessed(sync2) - changelog: ${JSON.stringify(changelog)} `,
                );
              } else if (Object.keys(changelog).length > 0) {
                // @todo-oddj-dashboard: mise à jour de la décision CA normalisée *sans* retraitement par Label (normDec.sourceName, normDec.sourceId, changelog)
                CustomLog.log("info", {
                  operationName: "ImportJurica",
                  msg: `Normalized Jurinet decision updated without reprocessed by Label ${normDec.sourceId} ${normDec.sourceName} changelog : ${changelog} `,
                  data: {
                    _id: normDec._id,
                    sourceId: normDec.sourceId,
                    sourceName: normDec.sourceName,
                    jurisdictionId: normDec.jurisdictionId,
                    jurisdictionName: normDec.jurisdictionName,
                    publishStatus: normDec.publishStatus,
                    labelStatus: normDec.labelStatus
                  }
                });
                await JudilibreIndex.updateDecisionDocument(
                  normDec,
                  duplicateId,
                  `update in decisions(sync2) - changelog: ${JSON.stringify(changelog)} `,
                );
              }
              normalizeCount++;
            } catch (e) {
              // @todo-oddj-dashboard: erreur de normalisation CA suite à une mise à jour (normalized.sourceName, normalized.sourceId, changelog, e)
              CustomLog.log("error", {
                operationName: "ImportJuricaError",
                msg: `Error jurica normalization following an update ${normalized.sourceId} ${normalized.sourceName} changelog : ${changelog}  - ${e}`,
                data: {
                  _id: row._id,
                  sourceId: normalized.sourceId,
                  sourceName: normalized.sourceName
                }
              });
              await JudilibreIndex.updateDecisionDocument(normalized, null, null, e);
              errorCount++;
            }
          }
        }

        if (exception && hasException === true) {
          hasException = false;
          hasExceptionToReprocess = false;
          try {
            exception.collected = true;
            await JudilibreIndex.replaceOne('exceptions', { _id: exception._id }, exception, {
              bypassDocumentValidation: true,
            });
          } catch (ignore) { }
        }

        let existingDoc = await JudilibreIndex.findOne('mainIndex', { _id: `jurica:${row._id} ` });
        if (existingDoc === null) {
          rawDocument = await raw.findOne({ _id: row._id });
          normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
          if (rawDocument && normalized) {
            const indexedDoc = await JudilibreIndex.buildJuricaDocument(rawDocument, duplicateId);
            indexedDoc.sderId = normalized._id;
            if (rawDocument._indexed === true) {
              indexedDoc.judilibreId = normalized._id.valueOf();
              if (typeof indexedDoc.judilibreId !== 'string') {
                indexedDoc.judilibreId = `${indexedDoc.judilibreId} `;
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
      } else {
        // @todo-oddj-dashboard: decision CA rejetée suite à une mise à jour ('jurica', row._id, row.JDEC_CODNAC, row.JDEC_CODNACPART, row.JDEC_IND_DEC_PUB)
        CustomLog.log("info", {
          operationName: "ImportJuricaRejected",
          msg: `Rejected jurica decision following an update ${row._id} ${row.JDEC_CODNAC} ${row.JDEC_CODNACPART}  - ${row.JDEC_IND_DEC_PUB}`,
          data: {
            _id: row._id,
            sourceId: row._id,
            sourceName: 'jurica',
            jdec_codnac: row.JDEC_CODNAC,
            jdec_codnacpart: row.JDEC_CODNACPART,
            jdec_ind_dec_pub: row.JDEC_IND_DEC_PUB,
          }
        });
        await juricaSource.markAsErroneous(row._id);
        await JudilibreIndex.updateJuricaDocument(
          row,
          duplicateId,
          duplicate ? `duplicate of ${duplicateId} ` : 'non-public',
        );
        if (duplicate) {
          duplicateCount++;
        } else {
          nonPublicCount++;
        }
      }

      let modifTime = DateTime.fromISO(row.JDEC_DATE_MAJ); // @TODO
      juricaLastDate = DateTime.max(juricaLastDate, modifTime);
    }

    await client.close();

    CustomLog.log("info", {
      operationName: "ImportJuricaSkip",
      msg: `Done Syncing Jurica - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Non - public: ${nonPublicCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
    });
  } else {
    CustomLog.log("info", {
      operationName: "ImportJuricaSkip",
      msg: `Done Syncing Jurica - Empty round.`,
    });
  }

  await juricaSource.close();

  try {
    fs.writeFileSync(path.join(__dirname, 'data', 'jurica.lastDate'), juricaLastDate.toISO());
  } catch (e) {
    console.error(e);
  }

  return true;
}

main();
