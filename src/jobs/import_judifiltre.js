const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const { Judifiltre } = require('../judifiltre');

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
  console.log('OpenJustice - Start "import_judifiltre" job:', new Date().toLocaleString());
  try {
    await importJudifiltre();
  } catch (e) {
    console.error('Judifiltre import error', e);
  }
  console.log('OpenJustice - End "import_judifiltre" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function importJudifiltre() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let row;
  let newCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
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
                normDec.public = true;
                normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
                if (normalized === null) {
                  const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
                  normDec._id = insertResult.insertedId;
                  await JudilibreIndex.indexDecisionDocument(normDec, null, 'is-public, import in decisions');
                  newCount++;
                  try {
                    const judifiltreResult = await Judifiltre.DeleteBatch([
                      {
                        sourceId: batch.releasableDecisions[i].sourceId,
                        sourceDb: batch.releasableDecisions[i].sourceDb,
                      },
                    ]);
                    await JudilibreIndex.updateJuricaDocument(
                      row,
                      null,
                      `is-public, deleted from Judifiltre: ${JSON.stringify(judifiltreResult)}`,
                    );
                  } catch (e) {
                    console.error(`Judifiltre delete public error`, e);
                    errorCount++;
                  }
                } else {
                  console.warn(
                    `Jurica import public issue: { sourceId: ${row._id}, sourceName: 'jurica' } already inserted...`,
                  );
                }
              } else {
                let normDec = await JuricaUtils.Normalize(row, normalized);
                normDec.originalText = JuricaUtils.removeMultipleSpace(normDec.originalText);
                normDec.originalText = JuricaUtils.replaceErroneousChars(normDec.originalText);
                normDec.pseudoText = JuricaUtils.removeMultipleSpace(normDec.pseudoText);
                normDec.pseudoText = JuricaUtils.replaceErroneousChars(normDec.pseudoText);
                normDec._version = decisionsVersion;
                normDec.public = true;
                normDec._id = normalized._id;
                await decisions.replaceOne({ _id: normDec._id }, normDec, { bypassDocumentValidation: true });
                await JudilibreIndex.indexDecisionDocument(normDec, null, 'is-public, update in decisions');
                updateCount++;
                try {
                  const judifiltreResult = await Judifiltre.DeleteBatch([
                    {
                      sourceId: batch.releasableDecisions[i].sourceId,
                      sourceDb: batch.releasableDecisions[i].sourceDb,
                    },
                  ]);
                  await JudilibreIndex.updateJuricaDocument(
                    row,
                    null,
                    `is-public, deleted from Judifiltre: ${JSON.stringify(judifiltreResult)}`,
                  );
                } catch (e) {
                  console.error(`Judifiltre delete public error`, e);
                  errorCount++;
                }
              }
            } else {
              console.error(
                `Judifiltre import public error: decision ${batch.releasableDecisions[i].sourceId} not found in rawJurica`,
              );
              errorCount++;
            }
          } catch (e) {
            console.error(`Judifiltre import public error`, batch.releasableDecisions[i]);
            errorCount++;
          }
        } else {
          console.log(`Judifiltre skip public decision`, batch.releasableDecisions[i]);
          skipCount++;
        }
      }
    } else {
      console.error(`Judifiltre import public error`, batch);
      errorCount++;
    }
  } catch (e) {
    console.error(`Judifiltre import public error`, e);
    errorCount++;
  }

  try {
    const batch = await Judifiltre.GetNotPublicBatch();
    if (batch && batch.notPublicDecisions && Array.isArray(batch.notPublicDecisions)) {
      for (let i = 0; i < batch.notPublicDecisions.length; i++) {
        if (
          batch.notPublicDecisions[i] &&
          batch.notPublicDecisions[i].sourceId &&
          batch.notPublicDecisions[i].sourceDb === 'jurica'
        ) {
          try {
            row = await rawJurica.findOne({ _id: batch.notPublicDecisions[i].sourceId });
            if (row) {
              let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });

              if (normalized !== null) {
                await decisions.deleteOne({ _id: normalized._id });
              }

              await rawJurica.deleteOne({ _id: row._id });

              try {
                const judifiltreResult = await Judifiltre.DeleteBatch([
                  {
                    sourceId: batch.notPublicDecisions[i].sourceId,
                    sourceDb: batch.notPublicDecisions[i].sourceDb,
                  },
                ]);
                await JudilibreIndex.updateJuricaDocument(
                  row,
                  null,
                  `not-public, deleted from Judifiltre: ${JSON.stringify(judifiltreResult)}`,
                );
                deleteCount++;
              } catch (e) {
                console.error(`Judifiltre cleaning non-public error`, e);
                errorCount++;
              }
            }
          } catch (e) {
            console.error(`Judifiltre cleaning non-public error`, batch.notPublicDecisions[i]);
            errorCount++;
          }
        } else {
          console.log(`Judifiltre skip non-public decision`, batch.notPublicDecisions[i]);
          skipCount++;
        }
      }
    } else {
      console.error(`Judifiltre cleaning non-public error`, batch);
      errorCount++;
    }
  } catch (e) {
    console.error(`Judifiltre cleaning non-public error`, e);
    errorCount++;
  }

  console.log(
    `Done Importing/Cleaning Judifiltre - New: ${newCount}, Update: ${updateCount}, Cleaned: ${deleteCount}, Skip: ${skipCount}, Error: ${errorCount}.`,
  );
  await client.close();
  return true;
}

main();
