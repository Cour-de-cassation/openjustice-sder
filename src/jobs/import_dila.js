const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// const walk = require('walkdir');
const { DilaUtils } = require('../dila-utils');
const { MongoClient } = require('mongodb');
// const needle = require('needle');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);
const readline = require('readline');

// const schema = {};
// const juri = [];

/*
function parseError(e) {
  if (e) {
    let error = {};

    try {
      Object.getOwnPropertyNames(e).forEach(function (key) {
        error[key] = e[key];
      });
    } catch (ignore) {}

    return error;
  } else {
    return 'unknown';
  }
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
*/

/* MAIN LOOP */
async function main() {
  console.log('Setup DB Clients...');
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();
  const database = client.db(process.env.MONGO_DBNAME);
  const rawDila = database.collection(process.env.MONGO_DILA_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let newCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let normalizeCount = 0;

  const stockFilePath = path.join(__dirname, 'data', 'dila_import.json');
  console.log(`Get decisions from DILA stock (${stockFilePath})...`);

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
        if (decisionToStore.NUMERO) {
          let normalized = await decisions.findOne({ registerNumber: decisionToStore.NUMERO, sourceName: 'jurinet' });
          if (normalized === null) {
            normalizeCount++;
          } else {
            console.log(Date.parse(normalized.dateDecision) - (Date.parse(decisionToStore.DATE_DEC) - 3600000));
            skipCount++;
          }
        } else {
          normalizeCount++;
        }
      }
    } catch (e) {
      console.error(e);
      errorCount++;
    }
  }

  console.log(`Teardown...`);
  console.log(`Done (new: ${newCount}, skip: ${skipCount}, error: ${errorCount}, normalized: ${normalizeCount}).`);

  await client.close();
  process.exit(0);
}

/*
async function main() {
  console.log('Start Import.');
  fs.writeFileSync(path.join(__dirname, 'dila_import.json'), '');
  let successCount = 0;
  let errorCount = 0;
  const emitter = walk(process.env.DILA_DIR);

  emitter.on('file', function (filename) {
    try {
      let xmlDocument = DilaUtils.CleanXML(fs.readFileSync(filename).toString());
      let jsonDocument = DilaUtils.XMLToJSON(xmlDocument, {
        filter: false,
      });
      flatten(jsonDocument, schema);
      fs.appendFileSync(path.join(__dirname, 'dila_import.json'), JSON.stringify(jsonDocument) + '\r\n');
      successCount++;
    } catch (e) {
      console.log(`Erroneous file: ${filename}.`, e);
      errorCount++;
    }
  });

  emitter.on('end', function () {
    console.log(`Success count: ${successCount}.`);
    console.log(`Error count: ${errorCount}.`);
    console.log('Exit Import.');
    fs.writeFileSync(path.join(__dirname, 'dila_schema.json'), JSON.stringify(schema, null, '  '));
  });
}
*/

/*
async function getZones(id, source, text) {
  const zoneData = JSON.stringify({
    arret_id: id,
    source: source,
    text: text,
  });
  const response = await needle('post', 'http://10.16.64.7:8090/zonage', zoneData, {
    json: true,
  });
  delete response.body.arret_id;
  return response.body;
}
*/

main();

/*
const basePath = 'C:\\Users\\Sebastien.Courvoisie\\Desktop\\DILA';
const files = fs.readdirSync(basePath);
const exec = require('child_process').exec;
const async = require('async');
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
        function (error, stdout, stderr) {
          cb(null);
        },
      );
    } else {
      cb(null);
    }
  },
  function (err) {
    console.log('Main done');
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
            function (error, stdout, stderr) {
              cb(null);
            },
          );
        } else {
          cb(null);
        }
      },
      function (err) {
        console.log('Freemium done');
      },
    );
  },
);
*/
