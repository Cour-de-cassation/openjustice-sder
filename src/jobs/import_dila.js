// DILA entries:
const SRC_ENTRIES = ['CASS', 'INCA']; // , 'CAPP'];
// CASS: https://echanges.dila.gouv.fr/OPENDATA/CASS/
// INCA: https://echanges.dila.gouv.fr/OPENDATA/INCA/
// CAPP: https://echanges.dila.gouv.fr/OPENDATA/CAPP/
// (ignore CAPP for now...)

// Path where all the .tar.gz files of every DILA entry
// have been downloaded, in their respective folder (CASS, INCA, CAPP):
const SRC_DIR = 'C:\\Users\\Sebastien.Courvoisie\\Desktop\\OPENDATA\\';

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

async function store(source, then) {
  // const { MongoClient } = require('mongodb');
  const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);
  const readline = require('readline');
  const { DilaUtils } = require('../dila-utils');

  /*
  console.log('Setup DB Clients...');
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawDila = database.collection(process.env.MONGO_DILA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);
  */

  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let normalizeCount = 0;

  if (!fs.existsSync(path.join(__dirname, 'data', `DILA_${source}`))) {
    fs.mkdirSync(path.join(__dirname, 'data', `DILA_${source}`));
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
      fs.writeFileSync(
        path.join(__dirname, 'data', `DILA_${source}`, decisionToStore._id + '.json'),
        JSON.stringify(decisionToStore, null, 2),
      );
      fs.writeFileSync(
        path.join(__dirname, 'data', `DILA_${source}`, decisionToStore._id + '_normalized.json'),
        JSON.stringify(await DilaUtils.Normalize(decisionToStore), null, 2),
      );
      /*
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
        skipCount++;
      }
      let normalized = await decisions.findOne({ sourceId: decisionToStore._id, sourceName: 'dila' });
      let normalizeDoc = null;
      if (normalized === null) {
        if (decisionToStore.NUMERO) {
          let alreadyFromJurinet = await decisions.findOne({
            registerNumber: decisionToStore.NUMERO,
            sourceName: 'jurinet',
          });
          if (alreadyFromJurinet === null) {
            normalizeDoc = await DilaUtils.Normalize(decisionToStore);
          }
        } else {
          normalizeDoc = await DilaUtils.Normalize(decisionToStore);
        }
        if (normalizeDoc !== null) {
          normalizeDoc._version = decisionsVersion;
          try {
            await decisions.insertOne(normalizeDoc, { bypassDocumentValidation: true });
            normalizeCount++;
          } catch (e) {
            console.error(e);
            errorCount++;
          }
        }
      }
      */
    } catch (e) {
      console.error(e);
      errorCount++;
    }
  }

  // await client.close();

  console.log(
    `Store done (${source} - new: ${newCount}, skip: ${skipCount}, error: ${errorCount}, normalized: ${normalizeCount}).`,
  );

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
  const walk = require('walkdir');
  const { DilaUtils } = require('../dila-utils');
  const basePath = `${SRC_DIR}${source}\\extract`;
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
      flatten(jsonDocument, schema);
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
    fs.writeFileSync(path.join(__dirname, 'data', `dila_schema_${source}.json`), JSON.stringify(schema, null, 2));
    if (typeof then === 'function') {
      then();
    } else {
      setTimeout(end, ms('1s'));
    }
  });
}

function dico(source, then) {
  const dict = {
    ORIGINE: [],
    NATURE: [],
    JURIDICTION: [],
    SOLUTION: [],
    PUB: [],
    BULLETIN: [],
    FORMATION: [],
    FORM_DEC_ATT: [],
  };
  const baseDir = path.join(__dirname, 'data', `DILA_${source}`);
  const files = fs.readdirSync(baseDir);
  for (let i = 0; i < files.length; i++) {
    if (/\.json$/.test(files[i]) === true && /normalized/.test(files[i]) === false) {
      const data = JSON.parse(fs.readFileSync(path.join(baseDir, files[i])).toString());
      for (let key in dict) {
        if (data[key] && dict[key].indexOf(data[key]) === -1) {
          dict[key].push(data[key]);
        }
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
              // 3. Store in 'rawDila' and 'decisions' [MANUAL]
              try {
                store(source, function () {
                  console.log(`source ${source} done.`);
                  cb(null);
                });
              } catch (e) {
                console.error(`store error (${source}).`, e);
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

// importDila();
buildDico();
