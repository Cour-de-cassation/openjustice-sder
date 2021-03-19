require('dotenv').config();
const fs = require('fs');
const path = require('path');
const walk = require('walkdir');
const { DilaUtils } = require('./dila-utils');
const { MongoClient } = require('mongodb');
const needle = require('needle');
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION);
const readline = require('readline');

const schema = {};
const juri = [];

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

/* MAIN LOOP */
async function main() {
  const fileStream = fs.createReadStream(path.join(__dirname, 'dila_import.json'));
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  let i = 0;
  rl.on('line', async (line) => {
    rl.pause();
    i++;
    try {
      let decision = JSON.parse(line);
      let decisionToStore = {
        ID: decision.META.META_COMMUN.ID,
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
        PRECEDENTS: null,
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
                decisionToStore.TITRAGE.push(item['$TEXT']);
              }
            });
          } else if (decision.TEXTE.SOMMAIRE.SCT['$TEXT']) {
            decisionToStore.TITRAGE.push(decision.TEXTE.SOMMAIRE.SCT['$TEXT']);
          }
        }
        if (decision.TEXTE.SOMMAIRE && decision.TEXTE.SOMMAIRE.ANA) {
          if (Array.isArray(decision.TEXTE.SOMMAIRE.ANA)) {
            decision.TEXTE.SOMMAIRE.ANA.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.SOMMAIRE.push(item['$TEXT']);
              }
            });
          } else if (decision.TEXTE.SOMMAIRE.ANA['$TEXT']) {
            decisionToStore.SOMMAIRE.push(decision.TEXTE.SOMMAIRE.ANA['$TEXT']);
          }
        }
        if (decision.TEXTE.CITATION_JP && decision.TEXTE.CITATION_JP.CONTENU_JP) {
          decisionToStore.PRECEDENTS = decision.TEXTE.CITATION_JP.CONTENU_JP;
        }
      }
      if (decision.LIENS) {
        if (decision.LIENS.LIEN) {
          if (Array.isArray(decision.LIENS.LIEN)) {
            decision.LIENS.LIEN.forEach((item) => {
              if (item['$TEXT']) {
                decisionToStore.TEXTES_APPLIQUES.push(item['$TEXT']);
              }
            });
          } else if (decision.LIENS.LIEN['$TEXT']) {
            decisionToStore.TEXTES_APPLIQUES.push(decision.LIENS.LIEN['$TEXT']);
          }
        }
      }
      for (let key in decisionToStore) {
        if (typeof decisionToStore[key] === 'string') {
          decisionToStore[key] = decisionToStore[key].trim(); // @TODO CLEAN
          if (decisionToStore[key] === '') {
            decisionToStore[key] = null;
          }
        } else if (Array.isArray(decisionToStore[key])) {
          decisionToStore[key].forEach((item, index) => {
            if (typeof item === 'string') {
              decisionToStore[key][index] = item.trim(); // @TODO CLEAN
            }
          });
        }
      }
      console.log(decisionToStore);
    } catch (ignore) {}
    rl.resume();
  }).on('close', async () => {
    console.log('all done');
    process.exit(0);
  });
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
