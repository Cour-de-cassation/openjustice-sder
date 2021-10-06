const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');
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
    // await importJurinet();
  } catch (e) {
    console.error('Jurinet import error', e);
  }
  try {
    // await importJurica();
  } catch (e) {
    console.error('Jurica import error', e);
  }
  try {
    await importDecatt();
  } catch (e) {
    console.error('Decatt import error', e);
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
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const jurinetSource = new JurinetOracle();
  await jurinetSource.connect();

  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;
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
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            await jurinetSource.markAsImported(row._id);
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
          } else {
            await jurinetSource.markAsImported(row._id);
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet import error (a) processing decision ${row._id}`, e);
          await jurinetSource.markAsErroneous(row._id);
          errorCount++;
        }
      } else {
        try {
          row._indexed = null;
          await rawJurinet.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
          let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurinet' });
          if (normalized === null) {
            let normDec = await JurinetUtils.Normalize(row);
            normDec._version = decisionsVersion;
            await decisions.insertOne(normDec, { bypassDocumentValidation: true });
            await jurinetSource.markAsImported(row._id);
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            newCount++;
          } else {
            await jurinetSource.markAsImported(row._id);
            skipCount++;
          }
        } catch (e) {
          console.error(`Jurinet import error (b) processing decision ${row._id}`, e);
          await jurinetSource.markAsErroneous(row._id);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Importing Jurinet - New: ${newCount}, Skip: ${skipCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await jurinetSource.close();
  return true;
}

async function importJurica() {
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
  let errorCount = 0;
  let skipCount = 0;
  let duplicateCount = 0;

  const juricaResult = await juricaSource.getNew();

  if (juricaResult) {
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let raw = await rawJurica.findOne({ _id: row._id });
      if (raw === null) {
        try {
          row._indexed = null;
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });

          let duplicate;
          try {
            let duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicate = true;
            } else {
              duplicate = false;
            }
          } catch (e) {
            duplicate = false;
          }

          if (duplicate === false) {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized === null) {
              let normDec = await JuricaUtils.Normalize(row);
              normDec._version = decisionsVersion;
              await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              await juricaSource.markAsImported(row._id);
              newCount++;
            } else {
              await juricaSource.markAsImported(row._id);
              skipCount++;
            }
          } else {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized !== null && normalized.locked === false) {
              /*
              try {
                await decisions.deleteOne({ sourceId: row._id, sourceName: 'jurica' });
              } catch (e) {
                console.error(e);
                errorCount++;
              }
              */
            }
            await juricaSource.markAsImported(row._id);
            duplicateCount++;
          }
        } catch (e) {
          console.error(`Jurica import error (a) processing decision ${row._id}`, e);
          await juricaSource.markAsErroneous(row._id);
          errorCount++;
        }
      } else {
        try {
          row._indexed = null;
          await rawJurica.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });

          let duplicate;
          try {
            let duplicateId = await JuricaUtils.GetJurinetDuplicate(row[process.env.MONGO_ID]);
            if (duplicateId !== null) {
              duplicate = true;
            } else {
              duplicate = false;
            }
          } catch (e) {
            duplicate = false;
          }

          if (duplicate === false) {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized === null) {
              let normDec = await JuricaUtils.Normalize(row);
              normDec._version = decisionsVersion;
              await decisions.insertOne(normDec, { bypassDocumentValidation: true });
              await juricaSource.markAsImported(row._id);
              newCount++;
            } else {
              await juricaSource.markAsImported(row._id);
              skipCount++;
            }
          } else {
            let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
            if (normalized !== null && normalized.locked === false) {
              /*
              try {
                await decisions.deleteOne({ sourceId: row._id, sourceName: 'jurica' });
              } catch (e) {
                console.error(e);
                errorCount++;
              }
              */
            }
            await juricaSource.markAsImported(row._id);
            duplicateCount++;
          }
        } catch (e) {
          console.error(`Jurica import error (b) processing decision ${row._id}`, e);
          await juricaSource.markAsErroneous(row._id);
          errorCount++;
        }
      }
    }
  }

  console.log(
    `Done Importing Jurica - New: ${newCount}, Skip: ${skipCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
  );
  await client.close();
  await juricaSource.close();
  return true;
}

async function importDecatt() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const rawJurica = database.collection(process.env.MONGO_JURICA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  const juricaSource = new JuricaOracle();
  await juricaSource.connect();

  // 1. Get all _decatt from rawJurinet (no other choice, really)...
  let allDecatt = [];

  let rawJurinetDocument;
  const rawJurinetCursor = await rawJurinet
    .find(
      { TYPE_ARRET: 'CC', _decatt: { $ne: null } },
      {
        allowDiskUse: true,
        fields: {
          _id: 1,
          _decatt: 1,
        },
      },
    )
    .sort({ _id: -1 });
  while ((rawJurinetDocument = await rawJurinetCursor.next())) {
    if (
      rawJurinetDocument._decatt &&
      Array.isArray(rawJurinetDocument._decatt) &&
      rawJurinetDocument._decatt.length > 0
    ) {
      for (let i = 0; i < rawJurinetDocument._decatt.length; i++) {
        if (allDecatt.indexOf(rawJurinetDocument._decatt[i]) === -1) {
          allDecatt.push(rawJurinetDocument._decatt[i]);
        }
      }
    }
  }

  console.log(`There are ${allDecatt.length} decatt to process...`);

  // 2. (re)Import every decatt...
  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  let normalizedCount = 0;
  let reNormalizedCount = 0;
  let skipCount = 0;
  for (let i = 0; i < allDecatt.length; i++) {
    try {
      let row = await juricaSource.getDecisionByID(allDecatt[i]);
      if (parseInt(row.IND_ANO, 10) === 0) {
        let raw = await rawJurica.findOne({ _id: row._id });
        if (raw === null) {
          row._indexed = null;
          await rawJurica.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
        } else {
          row._indexed = null;
          await rawJurica.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
          updateCount++;
        }
        let normalized = await decisions.findOne({ sourceId: row._id, sourceName: 'jurica' });
        if (normalized === null) {
          let normDec = await JuricaUtils.Normalize(row);
          normDec._version = decisionsVersion;
          await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normalizedCount++;
        } else {
          let normDec = await JuricaUtils.Normalize(row, normalized);
          normDec._version = decisionsVersion;
          await decisions.replaceOne({ _id: normalized._id }, normDec, {
            bypassDocumentValidation: true,
          });
          reNormalizedCount++;
        }
        await juricaSource.markAsImported(row._id);
      } else {
        skipCount++;
      }
    } catch (e) {
      console.error(`Could not process decatt ${allDecatt[i]}`, e);
      errorCount++;
    }
  }

  console.log(
    `Done - new: ${newCount}, update: ${updateCount}, normalized: ${normalizedCount}, renormalized: ${reNormalizedCount}, skip: ${skipCount}, error: ${errorCount}.`,
  );

  await juricaSource.close();
  await client.close();
  return true;
}

main();
