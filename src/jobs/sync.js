const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { MongoClient } = require('mongodb');

const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

async function main() {
  console.log('OpenJustice - Start "sync" job:', new Date().toLocaleString());
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
  console.log('OpenJustice - Exit "sync" job:', new Date().toLocaleString());
  process.exit(0);
}

async function syncJurinet() {
  const jurinetOrder = 'DESC';
  const jurinetBatch = 1000;
  const jurinetSource = new JurinetOracle({
    verbose: false,
  });
  let jurinetOffset = 0;
  try {
    jurinetOffset = parseInt(fs.readFileSync(path.join(__dirname, 'data', 'jurinet.offset')).toString(), 10);
  } catch (ignore) {
    jurinetOffset = 0;
  }

  await jurinetSource.connect();
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: jurinetBatch,
    order: jurinetOrder,
  });
  await jurinetSource.close();

  if (jurinetResult) {
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
    await client.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURINET_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    console.log(`Syncing Jurinet (${jurinetOffset}-${jurinetOffset + jurinetBatch})...`);

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let errorCount = 0;

    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let rawDocument = await raw.findOne({ sourceId: row[process.env.MONGO_ID] });
      let updated = false;

      if (rawDocument === null) {
        try {
          await raw.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
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
          '_titrage',
          '_analyse',
          '_partie',
          '_decatt',
        ];
        diff.forEach((key) => {
          if (row[key] !== rawDocument[key]) {
            console.log(`${key} has been updated...`);
            updated = true;
          }
        });

        if (updated === true) {
          try {
            await raw.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
            updateCount++;
          } catch (e) {
            updated = false;
            console.error(e);
            errorCount++;
          }
        }
      }

      let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' });
      if (normalized === null) {
        try {
          let normDec = JurinetUtils.Normalize(row);
          normDec._version = decisionsVersion;
          await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normalizeCount++;
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else if (normalized.locked === false) {
        if (updated === true || normalized._version !== decisionsVersion) {
          try {
            let normDec = JurinetUtils.Normalize(row, normalized);
            normDec._version = decisionsVersion;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normalizeCount++;
          } catch (e) {
            console.error(e);
            errorCount++;
          }
        }
      }

      jurinetOffset++;
    }

    await client.close();

    console.log(
      `Done Syncing Jurinet - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurinet - Empty round.`);
    jurinetOffset = 0;
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurinet.offset'), `${jurinetOffset}`);

  return true;
}

async function syncJurica() {
  const juricaOrder = 'DESC';
  const juricaBatch = 1000;
  const juricaSource = new JuricaOracle({
    verbose: false,
  });
  let juricaOffset = 0;
  try {
    juricaOffset = parseInt(fs.readFileSync(path.join(__dirname, 'data', 'jurica.offset')).toString(), 10);
  } catch (ignore) {
    juricaOffset = 0;
  }

  await juricaSource.connect();
  const juricaResult = await juricaSource.getBatch({
    offset: juricaOffset,
    limit: juricaBatch,
    order: juricaOrder,
  });
  await juricaSource.close();

  if (juricaResult) {
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true,
    });
    await client.connect();

    const database = client.db(process.env.MONGO_DBNAME);
    const raw = database.collection(process.env.MONGO_JURICA_COLLECTION);
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

    console.log(`Syncing Jurica (${juricaOffset}-${juricaOffset + juricaBatch})...`);

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let errorCount = 0;

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let rawDocument = await raw.findOne({ sourceId: row[process.env.MONGO_ID] });
      let updated = false;

      if (rawDocument === null) {
        try {
          await raw.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else {
        const diff = [
          'JDEC_HTML_SOURCE',
          'JDEC_DATE',
          'JDEC_ID_JURIDICTION',
          'JDEC_CODE_JURIDICTION',
          'JDEC_JURIDICTION',
          'JDEC_CODE_AUTORITE',
          'JDEC_LIB_AUTORITE',
          'JDEC_NUM_RG',
          'JDEC_NUM_REGISTRE',
          'JDEC_NOTICE_FORMAT',
          'JDEC_LIBELLE',
        ];
        diff.forEach((key) => {
          if (row[key] !== rawDocument[key]) {
            console.log(`${key} has been updated...`);
            updated = true;
          }
        });

        if (updated === true) {
          try {
            await raw.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true });
            updateCount++;
          } catch (e) {
            updated = false;
            console.error(e);
            errorCount++;
          }
        }
      }

      let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurica' });
      if (normalized === null) {
        try {
          let normDec = JuricaUtils.Normalize(row);
          normDec._version = decisionsVersion;
          await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normalizeCount++;
        } catch (e) {
          console.error(e);
          errorCount++;
        }
      } else if (normalized.locked === false) {
        if (updated === true || normalized._version !== decisionsVersion) {
          try {
            let normDec = JuricaUtils.Normalize(row, normalized);
            normDec._version = decisionsVersion;
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, {
              bypassDocumentValidation: true,
            });
            normalizeCount++;
          } catch (e) {
            console.error(e);
            errorCount++;
          }
        }
      }

      juricaOffset++;
    }

    await client.close();

    console.log(
      `Done Syncing Jurica - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurica - Empty round.`);
    juricaOffset = 0;
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurica.offset'), `${juricaOffset}`);

  return true;
}

main();
