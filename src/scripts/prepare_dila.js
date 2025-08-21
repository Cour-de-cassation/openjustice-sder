// DILA entries:
const SRC_ENTRIES = ['CAPP']; //, 'INCA']; // ['CAPP']; // ['CASS', 'INCA'];
// CASS: https://echanges.dila.gouv.fr/OPENDATA/CASS/
// INCA: https://echanges.dila.gouv.fr/OPENDATA/INCA/
// CAPP: https://echanges.dila.gouv.fr/OPENDATA/CAPP/

// Path where all the .tar.gz files of every DILA entry
// have been downloaded, in their respective folder (CASS, INCA, CAPP):
const SRC_DIR = '/Users/phasme/Documents/DILA/'; // 'C:\\Users\\Sebastien.Courvoisie\\Desktop\\OPENDATA\\';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const async = require('async');
const { parentPort } = require('worker_threads');
const ms = require('ms');

let selfKill = setTimeout(cancel, ms('24h'));

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

async function prepare(source, then) {
  const readline = require('readline');
  const { DilaUtils } = require('../dila-utils');
  const { Juritools } = require('../juritools');

  let newCount = 0;
  let errorCount = 0;

  if (!fs.existsSync(path.join(__dirname, 'data', `DILA_${source}_raw`))) {
    fs.mkdirSync(path.join(__dirname, 'data', `DILA_${source}_raw`));
  }

  if (!fs.existsSync(path.join(__dirname, 'data', `DILA_${source}_normalized`))) {
    fs.mkdirSync(path.join(__dirname, 'data', `DILA_${source}_normalized`));
  }

  const stockFilePath = path.join(__dirname, 'data', `dila_import_${source}.json`);
  console.log(`Get decisions from DILA stock (${source} : ${stockFilePath})...`);

  const fileStream = fs.createReadStream(stockFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      let decision = JSON.parse(line);
      let decisionToStore = {
        _id: decision.META.META_COMMUN.ID,
        ORIGINE: decision.META.META_COMMUN.ORIGINE,
        URL: decision.META.META_COMMUN.URL,
        NATURE: decision.META.META_COMMUN.NATURE,
        TITRE: decision.META.META_SPEC.META_JURI.TITRE,
        DATE_DEC: decision.META.META_SPEC.META_JURI.DATE_DEC,
        JURIDICTION: decision.META.META_SPEC.META_JURI.JURIDICTION,
        NUMERO: decision.META.META_SPEC.META_JURI.NUMERO,
        SOLUTION: decision.META.META_SPEC.META_JURI.SOLUTION,
        NUMERO_AFFAIRE: [],
        PUB: false,
        BULLETIN: null,
        FORMATION: null,
        FORM_DEC_ATT: null,
        DATE_DEC_ATT: null,
        SIEGE_APPEL: null,
        JURI_PREM: null,
        LIEU_PREM: null,
        DEMANDEUR: null,
        DEFENDEUR: null,
        PRESIDENT: null,
        AVOCAT_GL: null,
        AVOCATS: null,
        RAPPORTEUR: null,
        ECLI: null,
        TEXTE: null,
        TITRAGE: [],
        SOMMAIRE: [],
        PRECEDENTS: [],
        TEXTES_APPLIQUES: [],
        _indexed: null,
      };
      if (decision.META.META_SPEC.META_JURI_JUDI) {
        if (
          decision.META.META_SPEC.META_JURI_JUDI.NUMEROS_AFFAIRES &&
          decision.META.META_SPEC.META_JURI_JUDI.NUMEROS_AFFAIRES.NUMERO_AFFAIRE
        ) {
          if (Array.isArray(decision.META.META_SPEC.META_JURI_JUDI.NUMEROS_AFFAIRES.NUMERO_AFFAIRE)) {
            decisionToStore.NUMERO_AFFAIRE = decision.META.META_SPEC.META_JURI_JUDI.NUMEROS_AFFAIRES.NUMERO_AFFAIRE;
          } else {
            decisionToStore.NUMERO_AFFAIRE.push(decision.META.META_SPEC.META_JURI_JUDI.NUMEROS_AFFAIRES.NUMERO_AFFAIRE);
          }
        }
        if (decision.META.META_SPEC.META_JURI_JUDI.PUBLI_BULL) {
          if (/oui/i.test(decision.META.META_SPEC.META_JURI_JUDI.PUBLI_BULL.publie) === true) {
            decisionToStore.PUB = true;
          }
          if (decision.META.META_SPEC.META_JURI_JUDI.PUBLI_BULL['$TEXT']) {
            decisionToStore.BULLETIN = decision.META.META_SPEC.META_JURI_JUDI.PUBLI_BULL['$TEXT'];
          }
        }
        [
          'FORMATION',
          'FORM_DEC_ATT',
          'DATE_DEC_ATT',
          'SIEGE_APPEL',
          'JURI_PREM',
          'LIEU_PREM',
          'DEMANDEUR',
          'DEFENDEUR',
          'PRESIDENT',
          'AVOCAT_GL',
          'AVOCATS',
          'RAPPORTEUR',
          'ECLI',
        ].forEach((key) => {
          if (decision.META.META_SPEC.META_JURI_JUDI[key] || decision.META.META_SPEC.META_JURI_JUDI[key] === 0) {
            decisionToStore[key] = decision.META.META_SPEC.META_JURI_JUDI[key];
          }
        });
      }
      if (decision.TEXTE) {
        if (decision.TEXTE.BLOC_TEXTUEL && decision.TEXTE.BLOC_TEXTUEL.CONTENU) {
          decisionToStore.TEXTE = decision.TEXTE.BLOC_TEXTUEL.CONTENU;
        }
        if (decision.TEXTE.SOMMAIRE && decision.TEXTE.SOMMAIRE.SCT) {
          if (Array.isArray(decision.TEXTE.SOMMAIRE.SCT)) {
            decision.TEXTE.SOMMAIRE.SCT.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.TITRAGE.push(DilaUtils.CleanString(item['$TEXT'], true));
              }
            });
          } else if (decision.TEXTE.SOMMAIRE.SCT['$TEXT']) {
            decisionToStore.TITRAGE.push(DilaUtils.CleanString(decision.TEXTE.SOMMAIRE.SCT['$TEXT'], true));
          } else {
            decisionToStore.TITRAGE.push(DilaUtils.CleanString(decision.TEXTE.SOMMAIRE.SCT, true));
          }
          let cleanedTitrage = [];
          decisionToStore.TITRAGE.forEach((item) => {
            if (item) {
              let subTitrage = [];
              item.split('-').forEach((subItem) => {
                subItem = subItem
                  .replace(/^\s*\*/gm, '')
                  .replace(/\.\s*$/gm, '')
                  .trim();
                if (subItem) {
                  subTitrage.push(subItem);
                }
              });
              if (subTitrage.length > 0) {
                cleanedTitrage.push(subTitrage);
              }
            }
          });
          decisionToStore.TITRAGE = cleanedTitrage;
        }
        if (decision.TEXTE.SOMMAIRE && decision.TEXTE.SOMMAIRE.ANA) {
          if (Array.isArray(decision.TEXTE.SOMMAIRE.ANA)) {
            decision.TEXTE.SOMMAIRE.ANA.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.SOMMAIRE.push(DilaUtils.CleanString(item['$TEXT'], true));
              }
            });
          } else if (decision.TEXTE.SOMMAIRE.ANA['$TEXT']) {
            decisionToStore.SOMMAIRE.push(DilaUtils.CleanString(decision.TEXTE.SOMMAIRE.ANA['$TEXT'], true));
          } else {
            decisionToStore.SOMMAIRE.push(DilaUtils.CleanString(decision.TEXTE.SOMMAIRE.ANA, true));
          }
        }
        if (decision.TEXTE.CITATION_JP && decision.TEXTE.CITATION_JP.CONTENU_JP) {
          if (Array.isArray(decision.TEXTE.CITATION_JP.CONTENU_JP)) {
            decision.TEXTE.CITATION_JP.CONTENU_JP.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.PRECEDENTS.push(DilaUtils.CleanString(item['$TEXT'], true));
              }
            });
          } else if (decision.TEXTE.CITATION_JP.CONTENU_JP['$TEXT']) {
            decisionToStore.PRECEDENTS.push(
              DilaUtils.CleanString(decision.TEXTE.CITATION_JP.CONTENU_JP['$TEXT'], true),
            );
          } else {
            decisionToStore.PRECEDENTS.push(DilaUtils.CleanString(decision.TEXTE.CITATION_JP.CONTENU_JP, true));
          }
          let cleanedPrecedents = [];
          decisionToStore.PRECEDENTS.forEach((item) => {
            if (item) {
              item.split(/(?:cf\.|id\.|;|\n)/i).forEach((subItem) => {
                subItem = DilaUtils.CleanString(subItem, true);
                subItem = subItem
                  .replace(/^.*:/, '')
                  .replace(/\.\s*$/, '')
                  .trim();
                if (subItem && /\d+/.test(subItem) === true) {
                  cleanedPrecedents.push(subItem);
                }
              });
            }
          });
          decisionToStore.PRECEDENTS = cleanedPrecedents;
        }
      }
      if (decision.LIENS) {
        if (decision.LIENS.LIEN) {
          if (Array.isArray(decision.LIENS.LIEN)) {
            decision.LIENS.LIEN.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.TEXTES_APPLIQUES.push(DilaUtils.CleanString(item['$TEXT'], true));
              }
            });
          } else if (decision.LIENS.LIEN['$TEXT']) {
            decisionToStore.TEXTES_APPLIQUES.push(DilaUtils.CleanString(decision.LIENS.LIEN['$TEXT'], true));
          } else {
            decisionToStore.TEXTES_APPLIQUES.push(DilaUtils.CleanString(decision.LIENS.LIEN, true));
          }
          let cleanedTextesApp = [];
          decisionToStore.TEXTES_APPLIQUES.forEach((item) => {
            if (item) {
              item.split(/;/).forEach((subItem) => {
                subItem = DilaUtils.CleanString(subItem, true);
                subItem = subItem
                  .replace(/^.*:/, '')
                  .replace(/\.\s*$/, '')
                  .trim();
                if (subItem && /\d+/.test(subItem) === true) {
                  cleanedTextesApp.push(subItem);
                }
              });
            }
          });
          decisionToStore.TEXTES_APPLIQUES = cleanedTextesApp;
        }
      }
      for (let key in decisionToStore) {
        if (typeof decisionToStore[key] === 'string') {
          decisionToStore[key] = DilaUtils.CleanString(decisionToStore[key]);
          if (decisionToStore[key] === '') {
            decisionToStore[key] = null;
          }
        } else if (Array.isArray(decisionToStore[key])) {
          decisionToStore[key].forEach((item, index) => {
            if (typeof item === 'string') {
              decisionToStore[key][index] = DilaUtils.CleanString(item);
            }
          });
        }
      }
      const normalized = await DilaUtils.Normalize(decisionToStore);
      /*
      console.log(`zoning ${decisionToStore._id}...`);
      const t0 = new Date();
      normalized.zoning = await Juritools.GetZones(
        parseInt(`42${newCount}`),
        'ca',
        normalized.pseudoText,
        'http://127.0.0.1:8000',
      );
      const t1 = new Date();
      console.log(`zoned ${decisionToStore._id} in ${t1 - t0}.`);
      */
      if (
        normalized &&
        normalized.pseudoText &&
        /wpc:/i.test(normalized.pseudoText) === false &&
        normalized.pseudoText.length > 440 &&
        normalized.jurisdictionCode === 'CA'
      ) {
        if (normalized.appeals && normalized.appeals.length > 0) {
          normalized.registerNumber = normalized.appeals[0];
        }
        if (/r\W*g\W*\s?[:n]?[\s\\n]*\d+\s?\/\s?\d+/i.test(normalized.pseudoText)) {
          normalized.registerNumber = /r\W*g\W*\s?[:n]?[\s\\n]*(\d+\s?\/\s?\d+)/i
            .exec(normalized.pseudoText)[1]
            .replace(/\s/gim, '')
            .replace(/[a-z]/gim, '')
            .trim();
        }
        fs.writeFileSync(
          path.join(__dirname, 'data', `DILA_${source}_raw`, decisionToStore._id + '.json'),
          JSON.stringify(decisionToStore, null, 2),
        );
        fs.writeFileSync(
          path.join(__dirname, 'data', `DILA_${source}_normalized`, decisionToStore._id + '.json'),
          JSON.stringify(normalized, null, 2),
        );
        newCount++;
      }
    } catch (e) {
      console.error(e);
      errorCount++;
    }
  }

  console.log(`Prepare done (${source} - new: ${newCount}, error: ${errorCount}).`);

  if (typeof then === 'function') {
    then();
  } else {
    setTimeout(end, ms('1s'));
  }
}

function untar(source, then) {
  const basePath = `${SRC_DIR}${source}`;
  const files = fs.readdirSync(basePath);
  if (!fs.existsSync(path.join(basePath, 'extract'))) {
    fs.mkdirSync(path.join(basePath, 'extract'));
  }
  const exec = require('child_process').exec;
  async.eachSeries(
    files,
    function (file, cb) {
      if (/^\./i.test(file) === false && /\.tar\.gz$/i.test(file) === true && /free/i.test(file) === false) {
        let cmd = 'tar -xzkf ' + path.join(basePath, file) + ' --strip-components=1';
        exec(
          cmd,
          {
            cwd: path.join(basePath, 'extract'),
          },
          function () {
            cb(null);
          },
        );
      } else {
        cb(null);
      }
    },
    function () {
      console.log(`Main done (${source}).`);
      async.eachSeries(
        files,
        function (file, cb) {
          if (/^\./i.test(file) === false && /\.tar\.gz$/i.test(file) === true && /free/i.test(file) === true) {
            let cmd = 'tar -xzkf ' + path.join(basePath, file) + ' --strip-components=1';
            exec(
              cmd,
              {
                cwd: path.join(basePath, 'extract'),
              },
              function () {
                cb(null);
              },
            );
          } else {
            cb(null);
          }
        },
        function () {
          console.log(`Freemium done (${source}).`);
          console.log(`Exit untar (${source}).`);
          if (typeof then === 'function') {
            then();
          } else {
            setTimeout(end, ms('1s'));
          }
        },
      );
    },
  );
}

function flatten(src, dest) {
  Object.keys(src).forEach((key) => {
    if (typeof src[key] === 'object' && src[key] !== null) {
      if (dest[key] === undefined || typeof dest[key] !== 'object') {
        dest[key] = {};
      }
      flatten(src[key], dest[key]);
    } else {
      if (dest[key] === undefined) {
        dest[key] = 0;
      } else {
        dest[key]++;
      }
    }
  });
}

function processUntar(source, then) {
  const schema = {};
  const history = {};
  const walk = require('walkdir');
  const { DilaUtils } = require('../dila-utils');
  const basePath = path.join(`${SRC_DIR}${source}`, 'extract');
  fs.writeFileSync(path.join(__dirname, 'data', `dila_import_${source}.json`), '');
  let successCount = 0;
  let errorCount = 0;
  const emitter = walk(basePath);

  emitter.on('file', function (filename) {
    try {
      console.log(`Processing file (${source}): ${filename}...`);
      let xmlDocument = DilaUtils.CleanXML(fs.readFileSync(filename).toString());
      let jsonDocument = DilaUtils.XMLToJSON(xmlDocument, {
        filter: false,
      });
      // flatten(jsonDocument, schema);
      /*
      try {
        const year = jsonDocument.META.META_SPEC.META_JURI.DATE_DEC.split('-')[0];
        if (history[year] === undefined) {
          history[year] = 0;
        }
        history[year]++;
      } catch (ignore) {}
      */
      fs.appendFileSync(
        path.join(__dirname, 'data', `dila_import_${source}.json`),
        JSON.stringify(jsonDocument) + '\r\n',
      );
      successCount++;
    } catch (e) {
      console.log(`Erroneous file (${source}): ${filename}.`, e);
      errorCount++;
    }
  });

  emitter.on('end', function () {
    console.log(`Success count (${source}): ${successCount}.`);
    console.log(`Error count (${source}): ${errorCount}.`);
    console.log(`Exit processUntar (${source}).`);
    // fs.writeFileSync(path.join(__dirname, 'data', `dila_schema_${source}.json`), JSON.stringify(schema, null, 2));
    // fs.writeFileSync(path.join(__dirname, 'data', `dila_history_${source}.json`), JSON.stringify(history, null, 2));
    if (typeof then === 'function') {
      then();
    } else {
      setTimeout(end, ms('1s'));
    }
  });
}

function dico(source, then) {
  const dict = {
    ORIGINE: {},
    NATURE: {},
    JURIDICTION: {},
    SOLUTION: {},
    //PUB: {},
    //BULLETIN: {},
    //FORMATION: {},
    //FORM_DEC_ATT: {},
    //NUMERO_AFFAIRE: {},
    SIEGE_APPEL: {},
  };
  const baseDir = path.join(__dirname, 'data', `DILA_${source}_raw`);
  const files = fs.readdirSync(baseDir);
  for (let i = 0; i < files.length; i++) {
    if (/\.json$/.test(files[i]) === true) {
      const data = JSON.parse(fs.readFileSync(path.join(baseDir, files[i])).toString());
      for (let key in dict) {
        let datum = data[key];
        if (Array.isArray(datum)) {
          datum = datum[0];
        }
        if (datum && dict[key][datum] === undefined) {
          dict[key][datum] = 0;
        }
        dict[key][datum]++;
      }
    }
  }
  fs.writeFileSync(path.join(__dirname, 'data', `dila_dico_${source}.json`), JSON.stringify(dict, null, 2));
  if (typeof then === 'function') {
    then();
  } else {
    setTimeout(end, ms('1s'));
  }
}

async function store(source) {
  const { MongoClient } = require('mongodb');
  const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);

  const client = new MongoClient(process.env.MONGO_URI, { directConnection: true });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawDila = database.collection(process.env.MONGO_DILA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  await decisions.createIndex({ registerNumber: 1, sourceName: 1 });

  let newCount = 0;
  let errorCount = 0;
  let replacedCount = 0;
  let skipCount = 0;
  let normalizeCount = 0;

  const basePath = path.join(__dirname, 'data', `DILA_${source}`);
  const files = fs.readdirSync(basePath);

  for (let i = 0; i < files.length; i++) {
    if (/\.json$/.test(files[i]) === true && /normalized/.test(files[i]) === false) {
      try {
        const decisionToStore = JSON.parse(fs.readFileSync(path.join(basePath, files[i])).toString());
        const normalizeDoc = JSON.parse(
          fs.readFileSync(path.join(basePath, files[i].replace('.json', '_normalized.json')).toString()),
        );

        let insertOrUpdate = false;
        if (decisionToStore.NUMERO) {
          let alreadyFromJurinet = await decisions.findOne({
            registerNumber: `${decisionToStore.NUMERO}`,
            sourceName: 'jurinet',
          });
          if (alreadyFromJurinet === null) {
            console.log(`Decision ${decisionToStore._id} (${decisionToStore.NUMERO}) not found in Jurinet: add.`);
            insertOrUpdate = true;
          } else {
            console.log(
              `Decision ${decisionToStore._id} (${decisionToStore.NUMERO}) already in Jurinet as ${alreadyFromJurinet.sourceId}: skip.`,
            );
            skipCount++;
          }
        } else {
          console.log(`Decision ${decisionToStore._id} has no number: add anyway.`);
          insertOrUpdate = true;
        }

        if (insertOrUpdate) {
          let raw = await rawDila.findOne({ _id: decisionToStore._id });
          if (raw === null) {
            try {
              await rawDila.insertOne(decisionToStore, { bypassDocumentValidation: true });
              newCount++;
            } catch (e) {
              console.error(e);
              errorCount++;
            }
          } else {
            try {
              await rawDila.replaceOne({ _id: decisionToStore._id }, decisionToStore, {
                bypassDocumentValidation: true,
              });
              newCount++;
              replacedCount++;
            } catch (e) {
              console.error(e);
              errorCount++;
            }
          }

          normalizeDoc._version = decisionsVersion;
          let normalized = await decisions.findOne({ sourceId: decisionToStore._id, sourceName: 'dila' });
          if (normalized === null) {
            try {
              await decisions.insertOne(normalizeDoc, { bypassDocumentValidation: true });
              normalizeCount++;
            } catch (e) {
              console.error(e);
              errorCount++;
            }
          } else {
            try {
              await decisions.replaceOne({ _id: normalizeDoc._id }, normalizeDoc, {
                bypassDocumentValidation: true,
              });
              normalizeCount++;
              replacedCount++;
            } catch (e) {
              console.error(e);
              errorCount++;
            }
          }
        }
      } catch (e) {
        console.error(e);
        errorCount++;
      }
    }
  }

  await client.close();

  console.log(
    `Store done (${source} - new: ${newCount}, normalized: ${normalizeCount}), replaced: ${replacedCount}, skip: ${skipCount}, error: ${errorCount}.`,
  );
}

function importDila() {
  async.eachSeries(
    SRC_ENTRIES,
    function (source, cb) {
      // 1. Untar XML files:
      try {
        untar(source, function () {
          // 2. Process XML files:
          try {
            processUntar(source, function () {
              console.log(`source ${source} done.`);
              // 3. Prepare decisions to store in DB:
              try {
                prepare(source, function () {
                  console.log(`source ${source} done.`);
                  cb(null);
                });
              } catch (e) {
                console.error(`prepare error (${source}).`, e);
                cb(null);
              }
            });
          } catch (e) {
            console.error(`processUntar error (${source}).`, e);
            cb(null);
          }
        });
      } catch (e) {
        console.error(`untar error (${source}).`, e);
        cb(null);
      }
    },
    function () {
      console.log(`All done.`);
      setTimeout(end, ms('1s'));
    },
  );
}

function buildDico() {
  async.eachSeries(
    SRC_ENTRIES,
    function (source, cb) {
      dico(source, function () {
        cb(null);
      });
    },
    function () {
      console.log(`All done.`);
      setTimeout(end, ms('1s'));
    },
  );
}

async function storeDila() {
  for (let i = 0; i < SRC_ENTRIES.length; i++) {
    const source = SRC_ENTRIES[i];
    try {
      await store(source);
    } catch (e) {
      console.error(source, e);
    }
  }
  console.log(`All done.`);
  setTimeout(end, ms('1s'));
}

importDila();
// buildDico();
// storeDila();
