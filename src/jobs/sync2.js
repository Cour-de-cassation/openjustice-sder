const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const { JurinetOracle } = require('../jurinet-oracle');
const { JurinetUtils } = require('../jurinet-utils');
const { JuricaOracle } = require('../jurica-oracle');
const { JuricaUtils } = require('../jurica-utils');
const { JudilibreIndex } = require('../judilibre-index');
const { MongoClient } = require('mongodb');
const ms = require('ms');
const { DateTime } = require('luxon');
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
  console.log('OpenJustice - Start "sync2" job:', new Date().toLocaleString());
  try {
    await syncJurinet();
  } catch (e) {
    console.error('Jurinet sync2 error', e);
  }
  try {
    // await syncJurica(); // @TODO
  } catch (e) {
    console.error('Jurica sync2 error', e);
  }
  console.log('OpenJustice - End "sync2" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
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

    console.log(`Syncing Jurinet (${jurinetResult.length} decisions modified since ${jurinetLastDate.toISODate()})...`);

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
          await JudilibreIndex.indexJurinetDocument(row, null, 'import in rawJurinet (sync2)');
        } catch (e) {
          console.error(e);
          errorCount++;
        }
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
          '_natureAffaireCivil',
          '_natureAffairePenal',
          '_codeMatiereCivil',
        ];
        diff.forEach((key) => {
          if (JSON.stringify(row[key]) !== JSON.stringify(rawDocument[key])) {
            updated = true;
          }
        });

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

        if (updated === true) {
          try {
            row._indexed = null;
            await raw.replaceOne({ _id: row._id }, row, { bypassDocumentValidation: true });
            updateCount++;
            if (row['TYPE_ARRET'] !== 'CC') {
              wincicaCount++;
            }
            await JudilibreIndex.updateJurinetDocument(row, null, 'update in rawJurinet (sync2)');
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
          const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normDec._id = insertResult.insertedId;
          await JudilibreIndex.indexDecisionDocument(normDec, null, 'import in decisions (sync2)');
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
            normDec.dateCreation = new Date().toISOString();
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            await JudilibreIndex.updateDecisionDocument(normDec, null, 'update in decisions (sync2)');
            normalizeCount++;
          } catch (e) {
            console.error(e);
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
          await JudilibreIndex.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
        }
      }

      let modifTime = DateTime.fromJSDate(row.DT_MODIF);
      jurinetLastDate = DateTime.max(jurinetLastDate, modifTime);
    }

    await juricaSource.close();
    await client.close();

    console.log(
      `Done Syncing Jurinet - New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, WinciCA: ${wincicaCount}, Error: ${errorCount}.`,
    );
  } else {
    console.log(`Done Syncing Jurinet - Empty round.`);
  }

  fs.writeFileSync(path.join(__dirname, 'data', 'jurinet.lastDate'), jurinetLastDate.toISO());

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

    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i];
      let rawDocument = await raw.findOne({ _id: row._id });
      let updated = false;
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
          'IND_ANO',
          'AUT_ANO',
          '_portalis',
          'JDEC_CODE',
          'JDEC_CODNAC',
          'JDEC_IND_DEC_PUB',
          'JDEC_COLL_PARTIES',
          '_bloc_occultation',
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
            await JudilibreIndex.updateJuricaDocument(row, duplicateId, 'update in rawJurica (sync2)');
            updateCount++;
          } catch (e) {
            updated = false;
            console.error(e);
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
          const insertResult = await decisions.insertOne(normDec, { bypassDocumentValidation: true });
          normDec._id = insertResult.insertedId;
          await JudilibreIndex.indexDecisionDocument(normDec, duplicateId, 'import in decisions (sync2)');
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
            normDec.dateCreation = new Date().toISOString();
            if (duplicate === true) {
              normDec.labelStatus = 'exported';
            }
            await decisions.replaceOne({ _id: normalized._id }, normDec, {
              bypassDocumentValidation: true,
            });
            normDec._id = normalized._id;
            await JudilibreIndex.updateDecisionDocument(normDec, duplicateId, 'update in decisions (sync2)');
            normalizeCount++;
          } catch (e) {
            console.error(e);
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
          await JudilibreIndex.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
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
