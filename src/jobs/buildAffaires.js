const limit = 100;
const sort = 1;

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { parentPort } = require('worker_threads');
const ms = require('ms');

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
  console.log('OpenJustice - Start "buildAffaires" job:', new Date().toLocaleString());
  const path = require('path');
  const fs = require('fs');
  const { DateTime } = require('luxon');
  const { Juritools } = require('../juritools');
  const { JudilibreIndex } = require('../judilibre-index');
  const { JuricaUtils } = require('../jurica-utils');
  const { JurinetUtils } = require('../jurinet-utils');
  const oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

  const jurinetConnection = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    connectString: process.env.DB_HOST,
  });

  const juricaConnection = await oracledb.getConnection({
    user: process.env.DB_USER_JURICA,
    password: process.env.DB_PASS_JURICA,
    connectString: process.env.DB_HOST_JURICA,
  });

  const grcomConnection = await oracledb.getConnection({
    user: process.env.GRCOM_DB_USER,
    password: process.env.GRCOM_DB_PASS,
    connectString: process.env.DB_HOST,
  });

  const { MongoClient, ObjectID } = require('mongodb');

  const jIndexConnection = new MongoClient(process.env.INDEX_DB_URI, {
    useUnifiedTopology: true,
  });
  await jIndexConnection.connect();
  const jIndexClient = jIndexConnection.db(process.env.INDEX_DB_NAME);
  const jIndexMain = jIndexClient.collection('mainIndex');
  const jIndexAffaires = jIndexClient.collection('affaires');

  // Ensure indexes:
  await jIndexAffaires.createIndex({ numbers: 1 });
  await jIndexAffaires.createIndex({ ids: 1 });
  await jIndexAffaires.createIndex({ affaires: 1 });
  await jIndexAffaires.createIndex({ dates: 1 });
  await jIndexAffaires.createIndex({ jurisdictions: 1 });
  await jIndexAffaires.createIndex({ _id: 1, numbers: 1 });
  await jIndexAffaires.createIndex({ _id: 1, ids: 1 });
  await jIndexAffaires.createIndex({ _id: 1, affaires: 1 });
  await jIndexAffaires.createIndex({ _id: 1, dates: 1 });
  await jIndexAffaires.createIndex({ _id: 1, jurisdictions: 1 });

  // _id : specific ID (mongo ObjectId())
  // numbers: array of numbers (RG, pourvoi, etc.)
  // ids: array of decision ids (jurinet, jurica, etc.)
  // affaires: array of ID_AFFAIRE (GPCIV.AFF, GPCIV.DECATT)
  // dates: array of decision dates
  // jurisdictions: array of decision jurisdictions
  // numbers_ids: mapping number <-> decision ID (e.g. 'U8121289' -> 'jurinet:1784323')
  // numbers_affaires: mapping number <-> affaire ID (e.g. 'U8121289' -> 11122154)
  // numbers_dates: mapping number <-> date (e.g. 'U8121289' -> '2018-07-12')
  // numbers_jurisdictions: mapping number <-> jurisdiction (e.g. '09/01206' -> 'Cour d'appel de Caen')
  // dates_jurisdictions: mapping date <-> jurisdiction (e.g. '2018-07-12' -> 'Conseil de prud'hommes de Caen') <-- required because some dependencies don't have a recognizable number

  const DBSDERConnection = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await DBSDERConnection.connect();
  const DBSDERClient = DBSDERConnection.db(process.env.MONGO_DBNAME);
  const rawJurinet = DBSDERClient.collection('rawJurinet');
  const rawJurica = DBSDERClient.collection('rawJurica');

  // Ensure more indexes:
  await rawJurinet.createIndex({ IND_ANO: 1, TYPE_ARRET: -1 });
  await rawJurica.createIndex({ JDEC_NUM_RG: 1, JDEC_JURIDICTION: 1, JDEC_DATE: -1 });

  // First pass : Jurinet
  let total = 0;
  let incompleteCount = 0;
  let doneCount = 0;
  let noAffaire = 0;
  let skipCount = 0;
  let noDecatt = 0;
  let decattNotFound = 0;
  let decattFound = 0;
  let offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  let doc;
  let cursor = await rawJurinet.find({ TYPE_ARRET: 'CC' }).sort({ _id: sort }).skip(offset).limit(limit);
  while ((doc = await cursor.next())) {
    offset++;
    total++;
    if (doc.DT_DECISION) {
      let objAlreadyStored = await jIndexAffaires.findOne({ ids: `jurinet:${doc._id}` });
      let objToStore = {
        _id: objAlreadyStored !== null ? objAlreadyStored._id : new ObjectID(),
        numbers: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers)) : [],
        ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.ids)) : [],
        affaires: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.affaires)) : [],
        dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates)) : [],
        jurisdictions: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.jurisdictions)) : [],
        numbers_ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_ids)) : {},
        numbers_dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_dates)) : {},
        numbers_affaires:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_affaires)) : {},
        numbers_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_jurisdictions)) : {},
        dates_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates_jurisdictions)) : {},
      };
      let date = new Date(Date.parse(doc.DT_DECISION.toISOString()));
      date.setHours(date.getHours() + 2);
      let dateForIndexing = date.getFullYear() + '-';
      dateForIndexing += (date.getMonth() < 9 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1) + '-';
      dateForIndexing += date.getDate() < 10 ? '0' + date.getDate() : date.getDate();
      if (objToStore.ids.indexOf(`jurinet:${doc._id}`) === -1) {
        objToStore.ids.push(`jurinet:${doc._id}`);
      }
      if (objToStore.dates.indexOf(dateForIndexing) === -1) {
        objToStore.dates.push(dateForIndexing);
      }
      if (objToStore.jurisdictions.indexOf('Cour de cassation') === -1) {
        objToStore.jurisdictions.push('Cour de cassation');
      }
      objToStore.dates_jurisdictions[dateForIndexing] = 'Cour de cassation';
      const pourvoiQuery = `SELECT LIB
        FROM NUMPOURVOI
        WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
      const pourvoiResult = await jurinetConnection.execute(pourvoiQuery, [doc._id]);
      if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
        for (let ii = 0; ii < pourvoiResult.rows.length; ii++) {
          if (objToStore.numbers.indexOf(pourvoiResult.rows[ii]['LIB']) === -1) {
            objToStore.numbers.push(pourvoiResult.rows[ii]['LIB']);
          }
          objToStore.numbers_ids[pourvoiResult.rows[ii]['LIB']] = `jurinet:${doc._id}`;
          objToStore.numbers_dates[pourvoiResult.rows[ii]['LIB']] = dateForIndexing;
          objToStore.numbers_jurisdictions[pourvoiResult.rows[ii]['LIB']] = 'Cour de cassation';
          const affaireQuery = `SELECT GPCIV.AFF.ID_AFFAIRE
            FROM GPCIV.AFF
            WHERE CONCAT(GPCIV.AFF.CLE, GPCIV.AFF.CODE) = :pourvoi`;
          const affaireResult = await jurinetConnection.execute(affaireQuery, [pourvoiResult.rows[ii]['LIB']]);
          if (affaireResult && affaireResult.rows && affaireResult.rows.length > 0) {
            if (objToStore.affaires.indexOf(affaireResult.rows[0]['ID_AFFAIRE']) === -1) {
              objToStore.affaires.push(affaireResult.rows[0]['ID_AFFAIRE']);
            }
            objToStore.numbers_affaires[pourvoiResult.rows[ii]['LIB']] = affaireResult.rows[0]['ID_AFFAIRE'];
          }
        }
      }
      if (objToStore.affaires.length > 0) {
        for (let i = 0; i < objToStore.affaires.length; i++) {
          const decattQuery = `SELECT GPCIV.AFF.ID_ELMSTR, GPCIV.DECATT.NUM_RG, GPCIV.DECATT.DT_DECATT
            FROM GPCIV.DECATT, GPCIV.AFF
            WHERE GPCIV.DECATT.ID_AFFAIRE = GPCIV.AFF.ID_AFFAIRE AND GPCIV.DECATT.ID_AFFAIRE = :id_affaire`;
          const decattResult = await jurinetConnection.execute(decattQuery, [objToStore.affaires[i]]);
          if (
            decattResult &&
            decattResult.rows &&
            decattResult.rows.length > 0 &&
            decattResult.rows[0]['ID_ELMSTR'] &&
            decattResult.rows[0]['NUM_RG'] &&
            decattResult.rows[0]['DT_DECATT']
          ) {
            let decattDate = new Date(Date.parse(decattResult.rows[0]['DT_DECATT']));
            decattDate.setHours(decattDate.getHours() + 2);
            let strDecatt = decattDate.getFullYear();
            strDecatt +=
              '-' + (decattDate.getMonth() + 1 < 10 ? '0' + (decattDate.getMonth() + 1) : decattDate.getMonth() + 1);
            strDecatt += '-' + (decattDate.getDate() < 10 ? '0' + decattDate.getDate() : decattDate.getDate());
            const GRCOMQuery = `SELECT LIB_ELM
              FROM ELMSTR
              WHERE ID_ELMSTR = :id_elmstr`;
            const GRCOMResult = await grcomConnection.execute(GRCOMQuery, [decattResult.rows[0]['ID_ELMSTR']]);
            if (GRCOMResult && GRCOMResult.rows && GRCOMResult.rows.length > 0) {
              let decatt = null;
              let RGTerms = ['', ''];
              try {
                RGTerms = `${decattResult.rows[0]['NUM_RG']}`.split('/');
                RGTerms[0] = RGTerms[0].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
                RGTerms[1] = RGTerms[1].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
              } catch (ignore) {}
              decatt = await rawJurica.findOne({
                JDEC_NUM_RG: { $regex: `^0*${RGTerms[0]}/0*${RGTerms[1]}$` },
                JDEC_JURIDICTION: JuricaUtils.GetJuricaLocationFromELMSTRLocation(GRCOMResult.rows[0]['LIB_ELM']),
                JDEC_DATE: strDecatt,
              });
              if (decatt !== null) {
                if (decatt.JDEC_NUM_RG !== decattResult.rows[0]['NUM_RG']) {
                  decattResult.rows[0]['NUM_RG'] = decatt.JDEC_NUM_RG;
                }
                if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                  objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
                }
                if (objToStore.ids.indexOf(`jurica:${decatt._id}`) === -1) {
                  objToStore.ids.push(`jurica:${decatt._id}`);
                }
                if (objToStore.dates.indexOf(strDecatt) === -1) {
                  objToStore.dates.push(strDecatt);
                }
                if (objToStore.jurisdictions.indexOf(GRCOMResult.rows[0]['LIB_ELM']) === -1) {
                  objToStore.jurisdictions.push(GRCOMResult.rows[0]['LIB_ELM']);
                }
                objToStore.numbers_ids[decattResult.rows[0]['NUM_RG']] = `jurica:${decatt._id}`;
                objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
                objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
                objToStore.dates_jurisdictions[strDecatt] = GRCOMResult.rows[0]['LIB_ELM'];
                objToStore.numbers_jurisdictions[decattResult.rows[0]['NUM_RG']] = GRCOMResult.rows[0]['LIB_ELM'];
                decattFound++;
              } else {
                if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                  objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
                }
                if (objToStore.dates.indexOf(strDecatt) === -1) {
                  objToStore.dates.push(strDecatt);
                }
                if (objToStore.jurisdictions.indexOf(GRCOMResult.rows[0]['LIB_ELM']) === -1) {
                  objToStore.jurisdictions.push(GRCOMResult.rows[0]['LIB_ELM']);
                }
                objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
                objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
                objToStore.dates_jurisdictions[strDecatt] = GRCOMResult.rows[0]['LIB_ELM'];
                objToStore.numbers_jurisdictions[decattResult.rows[0]['NUM_RG']] = GRCOMResult.rows[0]['LIB_ELM'];
                decattNotFound++;
              }
            } else {
              if (objToStore.numbers.indexOf(decattResult.rows[0]['NUM_RG']) === -1) {
                objToStore.numbers.push(decattResult.rows[0]['NUM_RG']);
              }
              if (objToStore.dates.indexOf(strDecatt) === -1) {
                objToStore.dates.push(strDecatt);
              }
              objToStore.numbers_dates[decattResult.rows[0]['NUM_RG']] = strDecatt;
              objToStore.numbers_affaires[decattResult.rows[0]['NUM_RG']] = objToStore.affaires[i];
              decattNotFound++;
            }
          } else {
            noDecatt++;
          }
        }
        objToStore.dates.sort();
        if (objAlreadyStored === null) {
          await jIndexAffaires.insertOne(objToStore, { bypassDocumentValidation: true });
          console.log('Insert', objToStore);
        } else if (JSON.stringify(objToStore) !== JSON.stringify(objAlreadyStored)) {
          await jIndexAffaires.replaceOne({ _id: objAlreadyStored._id }, objToStore, {
            bypassDocumentValidation: true,
          });
          console.log('Update', objToStore);
        } else {
          skipCount++;
        }
        doneCount++;
      } else {
        noAffaire++;
      }
      for (let jj = 0; jj < objToStore.ids.length; jj++) {
        if (objToStore.ids[jj] === `jurinet:${doc._id}`) {
          const found = await jIndexMain.findOne({ _id: objToStore.ids[jj] });
          if (found === null) {
            const indexedDoc = await JudilibreIndex.buildJurinetDocument(doc);
            const lastOperation = DateTime.fromJSDate(new Date());
            indexedDoc.lastOperation = lastOperation.toISODate();
            await jIndexMain.insertOne(indexedDoc, { bypassDocumentValidation: true });
            console.log('Index', objToStore.ids[jj]);
          }
        }
      }
    } else {
      incompleteCount++;
    }
  }

  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurinet.offset'), `${offset}`);

  console.log({
    range: `${offset - limit}-${offset}`,
    source: 'jurinet',
    total: total,
    incompleteCount: incompleteCount,
    doneCount: doneCount,
    noAffaire: noAffaire,
    skipCount: skipCount,
    noDecatt: noDecatt,
    decattNotFound: decattNotFound,
    decattFound: decattFound,
  });

  // Second pass : Jurica

  total = 0;
  incompleteCount = 0;
  doneCount = 0;
  noAffaire = 0;
  skipCount = 0;
  noDecatt = 0;
  decattNotFound = 0;
  decattFound = 0;
  offset = 0;
  try {
    offset = parseInt(fs.readFileSync(path.join(__dirname, '.buildAffaires.jurica.offset')).toString(), 10);
    if (isNaN(offset)) {
      offset = 0;
    }
  } catch (ignore) {}
  doc = null;
  cursor = await rawJurica.find({}).sort({ _id: sort }).skip(offset).limit(limit);
  while ((doc = await cursor.next())) {
    offset++;
    total++;
    if (
      doc.JDEC_HTML_SOURCE &&
      doc.JDEC_NUM_RG &&
      doc.JDEC_DATE &&
      /^\d\d\d\d-\d\d-\d\d$/.test(`${doc.JDEC_DATE}`.trim())
    ) {
      let objAlreadyStored = await jIndexAffaires.findOne({ ids: `jurica:${doc._id}` });
      let objToStore = {
        _id: objAlreadyStored !== null ? objAlreadyStored._id : new ObjectID(),
        numbers: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers)) : [],
        ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.ids)) : [],
        affaires: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.affaires)) : [],
        dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates)) : [],
        jurisdictions: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.jurisdictions)) : [],
        numbers_ids: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_ids)) : {},
        numbers_dates: objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_dates)) : {},
        numbers_affaires:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_affaires)) : {},
        numbers_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.numbers_jurisdictions)) : {},
        dates_jurisdictions:
          objAlreadyStored !== null ? JSON.parse(JSON.stringify(objAlreadyStored.dates_jurisdictions)) : {},
      };
      let dateForIndexing = `${doc.JDEC_DATE}`.trim();
      if (objToStore.ids.indexOf(`jurica:${doc._id}`) === -1) {
        objToStore.ids.push(`jurica:${doc._id}`);
      }
      if (objToStore.dates.indexOf(dateForIndexing) === -1) {
        objToStore.dates.push(dateForIndexing);
      }
      let RGNumber = `${doc.JDEC_NUM_RG}`.trim();
      if (objToStore.numbers.indexOf(RGNumber) === -1) {
        objToStore.numbers.push(RGNumber);
      }
      let jurisdiction = JuricaUtils.GetELMSTRLocationFromJuricaLocation(doc.JDEC_JURIDICTION);
      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
        objToStore.jurisdictions.push(jurisdiction);
      }
      objToStore.numbers_ids[RGNumber] = `jurica:${doc._id}`;
      objToStore.numbers_dates[RGNumber] = dateForIndexing;
      objToStore.dates_jurisdictions[dateForIndexing] = jurisdiction;
      objToStore.numbers_jurisdictions[RGNumber] = jurisdiction;
      let hasPreced = false;

      try {
        const text = JuricaUtils.CleanHTML(doc.JDEC_HTML_SOURCE);
        const zoning = await Juritools.GetZones(doc._id, 'ca', text);
        if (zoning && zoning.introduction_subzonage && zoning.introduction_subzonage.j_preced_date) {
          const baseRegex = /(\d+)\D*\s+([a-zéû.]+)\s+(\d\d\d\d)/i;
          let remainingDates = [];
          let datesToCheck = [];
          let datesTaken = [];
          for (let dd = 0; dd < zoning.introduction_subzonage.j_preced_date.length; dd++) {
            if (baseRegex.test(zoning.introduction_subzonage.j_preced_date[dd])) {
              const baseMatch = baseRegex.exec(zoning.introduction_subzonage.j_preced_date[dd]);
              const baseDate = {
                day: parseInt(baseMatch[1]),
                month: JurinetUtils.ParseMonth(baseMatch[2]),
                year: parseInt(baseMatch[3]),
              };
              baseDate.day = baseDate.day < 10 ? `0${baseDate.day}` : `${baseDate.day}`;
              baseDate.month = baseDate.month < 10 ? `0${baseDate.month}` : `${baseDate.month}`;
              const fullDate = `${baseDate.year}-${baseDate.month}-${baseDate.day}`;
              if (!isNaN(Date.parse(fullDate))) {
                datesToCheck.push(fullDate);
              }
            }
          }
          if (zoning.introduction_subzonage.j_preced_nrg) {
            for (let rr = 0; rr < zoning.introduction_subzonage.j_preced_nrg.length; rr++) {
              let RGTerms = ['', ''];
              try {
                RGTerms = `${zoning.introduction_subzonage.j_preced_nrg[rr]}`.split('/');
                RGTerms[0] = RGTerms[0].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
                RGTerms[1] = RGTerms[1].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
              } catch (ignore) {}
              for (let ee = 0; ee < datesToCheck.length; ee++) {
                const decisionQuery = `SELECT JCA_DECISION.JDEC_ID, JCA_DECISION.JDEC_NUM_RG, JCA_DECISION.JDEC_JURIDICTION
                  FROM JCA_DECISION
                  WHERE REGEXP_LIKE(JCA_DECISION.JDEC_NUM_RG, '^0*${RGTerms[0]}/0*${RGTerms[1]} *$')
                  AND JCA_DECISION.JDEC_DATE = '${datesToCheck[ee]}'`;
                const decisionResult = await juricaConnection.execute(decisionQuery, []);
                if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
                  if (objAlreadyStored === null) {
                    objAlreadyStored = await jIndexAffaires.findOne({
                      ids: `jurica:${decisionResult.rows[0].JDEC_ID}`,
                    });
                  }
                  if (objAlreadyStored !== null) {
                    objToStore._id = objAlreadyStored._id;
                    objAlreadyStored.numbers.forEach((number) => {
                      if (objToStore.numbers.indexOf(number) === -1) {
                        objToStore.numbers.push(number);
                      }
                      objToStore.numbers_ids[number] = objAlreadyStored.numbers_ids[number];
                      objToStore.numbers_dates[number] = objAlreadyStored.numbers_dates[number];
                      objToStore.numbers_affaires[number] = objAlreadyStored.numbers_affaires[number];
                      objToStore.numbers_jurisdictions[number] = objAlreadyStored.numbers_jurisdictions[number];
                    });
                    objAlreadyStored.ids.forEach((id) => {
                      if (objToStore.ids.indexOf(id) === -1) {
                        objToStore.ids.push(id);
                      }
                    });
                    objAlreadyStored.affaires.forEach((affaire) => {
                      if (objToStore.affaires.indexOf(affaire) === -1) {
                        objToStore.affaires.push(affaire);
                      }
                    });
                    objAlreadyStored.dates.forEach((date) => {
                      if (objToStore.dates.indexOf(date) === -1) {
                        objToStore.dates.push(date);
                      }
                      objToStore.dates_jurisdictions[date] = objAlreadyStored.dates_jurisdictions[date];
                    });
                    objAlreadyStored.jurisdictions.forEach((jurisdiction) => {
                      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
                        objToStore.jurisdictions.push(jurisdiction);
                      }
                    });
                  }
                  if (objToStore.ids.indexOf(`jurica:${decisionResult.rows[0].JDEC_ID}`) === -1) {
                    objToStore.ids.push(`jurica:${decisionResult.rows[0].JDEC_ID}`);
                  }
                  if (objToStore.dates.indexOf(datesToCheck[ee]) === -1) {
                    objToStore.dates.push(datesToCheck[ee]);
                  }
                  let actualRGNumber = `${decisionResult.rows[0].JDEC_NUM_RG}`.trim();
                  if (objToStore.numbers.indexOf(actualRGNumber) === -1) {
                    objToStore.numbers.push(actualRGNumber);
                  }
                  let actualJurisdiction = JuricaUtils.GetELMSTRLocationFromJuricaLocation(
                    decisionResult.rows[0].JDEC_JURIDICTION,
                  );
                  if (objToStore.jurisdictions.indexOf(actualJurisdiction) === -1) {
                    objToStore.jurisdictions.push(actualJurisdiction);
                  }
                  objToStore.numbers_ids[actualRGNumber] = `jurica:${decisionResult.rows[0].JDEC_ID}`;
                  objToStore.numbers_dates[actualRGNumber] = datesToCheck[ee];
                  objToStore.dates_jurisdictions[datesToCheck[ee]] = actualJurisdiction;
                  objToStore.numbers_jurisdictions[actualRGNumbers] = actualJurisdiction;
                  if (datesTaken.indexOf(datesToCheck[ee]) === -1) {
                    datesTaken.push(datesToCheck[ee]);
                  }
                  hasPreced = true;
                  break;
                }
              }
            }
          }
          // Dates can't be shared between jurisdictions
          remainingDates = [];
          datesToCheck.forEach((date) => {
            if (datesTaken.indexOf(date) === -1) {
              remainingDates.push(date);
            }
          });
          datesToCheck = remainingDates;
          if (zoning.introduction_subzonage.j_preced_npourvoi) {
            for (let pp = 0; pp < zoning.introduction_subzonage.j_preced_npourvoi.length; pp++) {
              let simplePourvoi = parseInt(
                `${zoning.introduction_subzonage.j_preced_npourvoi[pp]}`.replace(/\D/gm, '').trim(),
                10,
              );
              for (let ee = 0; ee < datesToCheck.length; ee++) {
                const pourvoiQuery = `SELECT DOCUMENT.ID_DOCUMENT
                  FROM NUMPOURVOI, DOCUMENT
                  WHERE NUMPOURVOI.ID_DOCUMENT = DOCUMENT.ID_DOCUMENT
                  AND NUMPOURVOI.NUMPOURVOICODE = :code
                  AND DOCUMENT.DT_DECISION = TO_DATE('${datesToCheck[ee]}', 'YYYY-MM-DD')`;
                const pourvoiResult = await jurinetConnection.execute(pourvoiQuery, [simplePourvoi]);
                if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
                  if (objAlreadyStored === null) {
                    objAlreadyStored = await jIndexAffaires.findOne({
                      ids: `jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`,
                    });
                  }
                  if (objAlreadyStored !== null) {
                    objToStore._id = objAlreadyStored._id;
                    objAlreadyStored.numbers.forEach((number) => {
                      if (objToStore.numbers.indexOf(number) === -1) {
                        objToStore.numbers.push(number);
                      }
                      objToStore.numbers_ids[number] = objAlreadyStored.numbers_ids[number];
                      objToStore.numbers_dates[number] = objAlreadyStored.numbers_dates[number];
                      objToStore.numbers_affaires[number] = objAlreadyStored.numbers_affaires[number];
                      objToStore.numbers_jurisdictions[number] = objAlreadyStored.numbers_jurisdictions[number];
                    });
                    objAlreadyStored.ids.forEach((id) => {
                      if (objToStore.ids.indexOf(id) === -1) {
                        objToStore.ids.push(id);
                      }
                    });
                    objAlreadyStored.affaires.forEach((affaire) => {
                      if (objToStore.affaires.indexOf(affaire) === -1) {
                        objToStore.affaires.push(affaire);
                      }
                    });
                    objAlreadyStored.dates.forEach((date) => {
                      if (objToStore.dates.indexOf(date) === -1) {
                        objToStore.dates.push(date);
                      }
                      objToStore.dates_jurisdictions[date] = objAlreadyStored.dates_jurisdictions[date];
                    });
                    objAlreadyStored.jurisdictions.forEach((jurisdiction) => {
                      if (objToStore.jurisdictions.indexOf(jurisdiction) === -1) {
                        objToStore.jurisdictions.push(jurisdiction);
                      }
                    });
                  }
                  if (objToStore.ids.indexOf(`jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`) === -1) {
                    objToStore.ids.push(`jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`);
                  }
                  if (objToStore.dates.indexOf(datesToCheck[ee]) === -1) {
                    objToStore.dates.push(datesToCheck[ee]);
                  }
                  if (objToStore.jurisdictions.indexOf('Cour de cassation') === -1) {
                    objToStore.jurisdictions.push('Cour de cassation');
                  }
                  objToStore.dates_jurisdictions[datesToCheck[ee]] = 'Cour de cassation';
                  const pourvoiQuery2 = `SELECT LIB
                    FROM NUMPOURVOI
                    WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
                  const pourvoiResult2 = await jurinetConnection.execute(pourvoiQuery2, [
                    pourvoiResult.rows[0].ID_DOCUMENT,
                  ]);
                  if (pourvoiResult2 && pourvoiResult2.rows && pourvoiResult2.rows.length > 0) {
                    for (let iii = 0; iii < pourvoiResult2.rows.length; iii++) {
                      if (objToStore.numbers.indexOf(pourvoiResult2.rows[iii]['LIB']) === -1) {
                        objToStore.numbers.push(pourvoiResult2.rows[iii]['LIB']);
                      }
                      objToStore.numbers_ids[
                        pourvoiResult2.rows[iii]['LIB']
                      ] = `jurinet:${pourvoiResult.rows[0].ID_DOCUMENT}`;
                      objToStore.numbers_dates[pourvoiResult2.rows[iii]['LIB']] = datesToCheck[ee];
                      objToStore.numbers_jurisdictions[pourvoiResult2.rows[iii]['LIB']] = 'Cour de cassation';
                      const affaireQuery = `SELECT GPCIV.AFF.ID_AFFAIRE
                        FROM GPCIV.AFF
                        WHERE CONCAT(GPCIV.AFF.CLE, GPCIV.AFF.CODE) = :pourvoi`;
                      const affaireResult = await jurinetConnection.execute(affaireQuery, [
                        pourvoiResult2.rows[iii]['LIB'],
                      ]);
                      if (affaireResult && affaireResult.rows && affaireResult.rows.length > 0) {
                        if (objToStore.affaires.indexOf(affaireResult.rows[0]['ID_AFFAIRE']) === -1) {
                          objToStore.affaires.push(affaireResult.rows[0]['ID_AFFAIRE']);
                        }
                        objToStore.numbers_affaires[pourvoiResult2.rows[iii]['LIB']] =
                          affaireResult.rows[0]['ID_AFFAIRE'];
                      }
                    }
                  }
                  if (datesTaken.indexOf(datesToCheck[ee]) === -1) {
                    datesTaken.push(datesToCheck[ee]);
                  }
                  hasPreced = true;
                  break;
                }
              }
            }
          }
        }
      } catch (ignore) {}

      if (hasPreced == true || objAlreadyStored !== null) {
        objToStore.dates.sort();
        if (objAlreadyStored === null) {
          await jIndexAffaires.insertOne(objToStore, { bypassDocumentValidation: true });
          console.log('Insert', objToStore);
        } else if (JSON.stringify(objToStore) !== JSON.stringify(objAlreadyStored)) {
          await jIndexAffaires.replaceOne({ _id: objAlreadyStored._id }, objToStore, {
            bypassDocumentValidation: true,
          });
          console.log('Update', objToStore);
        } else {
          skipCount++;
        }
        doneCount++;
      } else {
        noAffaire++;
      }
      for (let jj = 0; jj < objToStore.ids.length; jj++) {
        if (objToStore.ids[jj] === `jurica:${doc._id}`) {
          const found = await jIndexMain.findOne({ _id: objToStore.ids[jj] });
          if (found === null) {
            const indexedDoc = await JudilibreIndex.buildJuricaDocument(doc);
            const lastOperation = DateTime.fromJSDate(new Date());
            indexedDoc.lastOperation = lastOperation.toISODate();
            await jIndexMain.insertOne(indexedDoc, { bypassDocumentValidation: true });
            console.log('Index', objToStore.ids[jj]);
          }
        }
      }
    } else {
      incompleteCount++;
    }
  }

  fs.writeFileSync(path.join(__dirname, '.buildAffaires.jurica.offset'), `${offset}`);

  console.log({
    range: `${offset - limit}-${offset}`,
    source: 'jurica',
    total: total,
    incompleteCount: incompleteCount,
    doneCount: doneCount,
    noPreced: noAffaire,
    skipCount: skipCount,
    noDecatt: noDecatt,
    decattNotFound: decattNotFound,
    decattFound: decattFound,
  });

  await jurinetConnection.close();
  await juricaConnection.close();
  await grcomConnection.close();
  await DBSDERConnection.close();
  await jIndexConnection.close();

  console.log('OpenJustice - End "buildAffaires" job:', new Date().toLocaleString());
  setTimeout(end, ms('1s'));
}

main();
