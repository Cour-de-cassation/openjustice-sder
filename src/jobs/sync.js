const fs = require('fs');
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
  console.log('OpenJustice - End "sync" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

async function syncJurinet() {
  const jurinetOrder = 'DESC';
  const jurinetBatch = 1000;
  const jurinetSource = new JurinetOracle();
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
    onlyTreated: false,
  });
  await jurinetSource.close();

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

    console.log(`Syncing Jurinet (${jurinetOffset}-${jurinetOffset + jurinetBatch})...`);

    let newCount = 0;
    let updateCount = 0;
    let normalizeCount = 0;
    let wincicaCount = 0;
    let errorCount = 0;

    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;

      if (rawDocument === null) {
        try {
          row._indexed = null;
          await raw.insertOne(row, { bypassDocumentValidation: true });
          newCount++;
          if (row['TYPE_ARRET'] !== 'CC') {
            wincicaCount++;
          }
          if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
            for (let d = 0; d < row._decatt.length; d++) {
              await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
            }
          }
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
        ];
        diff.forEach((key) => {
          if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
            updated = true;
          }
        });

        if (updated === true) {
          try {
            row._indexed = null;
            await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            updateCount++;
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            if (row._decatt && Array.isArray(row._decatt) && row._decatt.length > 0) {
              for (let d = 0; d < row._decatt.length; d++) {
                await JuricaUtils.ImportDecatt(row._decatt[d], juricaSource, rawJurica, decisions);
              }
            }
          } catch (e) {
            updated = false;
            console.error(e);
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
          await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normalizeCount++;
        } catch (e) {
          console.error(e);
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
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
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

    await juricaSource.close();
    await client.close();

    console.log(
      `Done Syncing Jurinet - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
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
  const juricaSource = new JuricaOracle();
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
    onlyTreated: false,
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
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;

      if (rawDocument === null) {
        try {
          row._indexed = null;
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
          'IND_ANO',
          'AUT_ANO',
          '_portalis',
          'JDEC_CODE',
          'JDEC_CODNAC',
          'JDEC_IND_DEC_PUB',
          'JDEC_COLL_PARTIES',
        ];
        diff.forEach((key) => {
          if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
            updated = true;
          }
        });

        if (updated === true) {
          try {
            row._indexed = null;
            await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            updateCount++;
          } catch (e) {
            updated = false;
            console.error(e);
            errorCount++;
          }
        }
      }

      let duplicate;
      try {
        let duplicateId = await JuricaUtils.GetJurinetDuplicate(row._id);
        if (duplicateId !== null) {
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
          await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normalizeCount++;
        } catch (e) {
          console.error(e);
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
            if (duplicate === true) {
              normDec.labelStatus = 'exported';
            }
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
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
      `Done Syncing Jurica - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Duplicate: ${duplicateCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurica - Empty round.`);
    juricaOffset = 0;
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurica.offset'), `${juricaOffset}`);

  return true;
}

main();
